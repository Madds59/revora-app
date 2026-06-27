"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { enqueueJobStatusNotification } from "@/lib/notifications/service";
import { canManageJobs } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { JobStatus } from "@/lib/database.types";

export type FormState = { error?: string; message?: string };

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optional(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

const JOB_STATUSES: JobStatus[] = [
  "pending",
  "approved",
  "in_progress",
  "waiting_parts",
  "delayed",
  "completed",
  "cancelled",
];

export async function updateJobStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageJobs(member.role))
    return { error: "You don't have permission to manage jobs." };

  const id = str(formData, "id");
  const status = str(formData, "status") as JobStatus;
  if (!id) return { error: "Missing job id." };
  if (!JOB_STATUSES.includes(status)) return { error: "Invalid status." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) {
    console.error("updateJobStatus failed", error);
    return { error: "Could not update job status. Please try again." };
  }

  await enqueueJobStatusNotification({
    jobId: id,
    statusLabel: status.replaceAll("_", " "),
  });

  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  return { message: "Job status updated." };
}

export async function postJobUpdate(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageJobs(member.role))
    return { error: "You don't have permission to post updates." };

  const jobId = str(formData, "job_id");
  const message = str(formData, "message");
  if (!jobId) return { error: "Missing job id." };
  if (!message) return { error: "Update message is required." };

  const statusRaw = str(formData, "status");
  const status = JOB_STATUSES.includes(statusRaw as JobStatus)
    ? (statusRaw as JobStatus)
    : null;
  const visibleToCustomer = formData.get("visible_to_customer") === "on";

  const user = await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("job_updates").insert({
    business_id: business.id,
    job_id: jobId,
    status,
    message,
    visible_to_customer: visibleToCustomer,
    created_by: user?.id ?? null,
  });
  if (error) {
    console.error("postJobUpdate failed", error);
    return { error: "Could not post update. Please try again." };
  }

  // Optionally advance the job status alongside the update.
  if (status) {
    await supabase
      .from("jobs")
      .update({
        status,
        completed_at:
          status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", jobId);

    if (visibleToCustomer) {
      await enqueueJobStatusNotification({
        jobId,
        statusLabel: status.replaceAll("_", " "),
      });
    }
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { message: "Update posted." };
}

export async function addJobTask(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member, business } = await requireMembership();
  if (!canManageJobs(member.role))
    return { error: "You don't have permission to manage tasks." };

  const jobId = str(formData, "job_id");
  const title = str(formData, "title");
  if (!jobId) return { error: "Missing job id." };
  if (!title) return { error: "Task title is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("job_tasks").insert({
    business_id: business.id,
    job_id: jobId,
    title,
    description: optional(formData, "description"),
  });
  if (error) {
    console.error("addJobTask failed", error);
    return { error: "Could not add task. Please try again." };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { message: "Task added." };
}

export async function toggleJobTask(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageJobs(member.role))
    return { error: "You don't have permission to manage tasks." };

  const id = str(formData, "id");
  const jobId = str(formData, "job_id");
  const completed = formData.get("is_completed") === "true";
  if (!id || !jobId) return { error: "Missing task id." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_tasks")
    .update({
      is_completed: completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) {
    console.error("toggleJobTask failed", error);
    return { error: "Could not update task. Please try again." };
  }

  revalidatePath(`/jobs/${jobId}`);
  return { message: completed ? "Task completed." : "Task reopened." };
}
