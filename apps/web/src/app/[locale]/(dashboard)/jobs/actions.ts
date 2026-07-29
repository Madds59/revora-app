"use server";

import { revalidatePath } from "next/cache";

import { getUser, requireMembership } from "@/lib/auth";
import { enqueueJobStatusNotification } from "@/lib/notifications/service";
import { canManageJobs } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { firstValidationMessage } from "@/lib/validation/common";
import {
  addJobTaskSchema,
  postJobUpdateSchema,
  toggleJobTaskSchema,
  updateJobStatusSchema,
} from "@/lib/validation/jobs";

export type FormState = { error?: string; message?: string };

export async function updateJobStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { member } = await requireMembership();
  if (!canManageJobs(member.role))
    return { error: "You don't have permission to manage jobs." };

  const parsed = updateJobStatusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id, status } = parsed.data;

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

  const parsed = postJobUpdateSchema.safeParse({
    jobId: formData.get("job_id"),
    message: formData.get("message"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { jobId, message, status } = parsed.data;

  const visibleToCustomer = formData.get("visible_to_customer") === "on";

  const user = await getUser();
  const supabase = await createClient();

  const { error } = await supabase.from("job_updates").insert({
    business_id: business.id,
    job_id: jobId,
    status: status ?? null,
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

  const parsed = addJobTaskSchema.safeParse({
    jobId: formData.get("job_id"),
    title: formData.get("title"),
    description: formData.get("description"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { jobId, title, description } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("job_tasks").insert({
    business_id: business.id,
    job_id: jobId,
    title,
    description: description ?? null,
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

  const parsed = toggleJobTaskSchema.safeParse({
    id: formData.get("id"),
    jobId: formData.get("job_id"),
  });
  if (!parsed.success) return { error: firstValidationMessage(parsed) };
  const { id, jobId } = parsed.data;

  const completed = formData.get("is_completed") === "true";

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
