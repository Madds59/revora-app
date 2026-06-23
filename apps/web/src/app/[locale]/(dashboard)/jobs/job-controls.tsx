"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  addJobTask,
  postJobUpdate,
  toggleJobTask,
  updateJobStatus,
  type FormState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_STATUS_LABELS, getJobStatusLabel } from "@/lib/jobs";
import type { JobStatus } from "@/lib/database.types";
import { useLocale } from "next-intl";

const initial: FormState = {};

const STATUSES = Object.keys(JOB_STATUS_LABELS) as JobStatus[];

function useToast(state: FormState, onSuccess?: () => void) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (state.message && state.message !== last.current) {
      last.current = state.message;
      toast.success(state.message);
      onSuccess?.();
    }
    if (state.error && state.error !== last.current) {
      last.current = state.error;
      toast.error(state.error);
    }
  }, [state, onSuccess]);
}

export function JobStatusForm({
  jobId,
  current,
}: {
  jobId: string;
  current: JobStatus;
}) {
  const [state, action] = useActionState(updateJobStatus, initial);
  const [status, setStatus] = useState<JobStatus>(current);
  const locale = useLocale();
  useToast(state);
  return (
    <form action={action} className="flex items-end gap-3">
      <input type="hidden" name="id" value={jobId} />
      <input type="hidden" name="status" value={status} />
      <div className="grid gap-2">
        <Label htmlFor="job-status">Status</Label>
        <Select
          value={status}
          onValueChange={(v) => setStatus((v as JobStatus) ?? current)}
        >
          <SelectTrigger id="job-status" className="w-48">
            <SelectValue>{(value) => (value ? getJobStatusLabel(value, locale) : null)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
                {getJobStatusLabel(s, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </form>
  );
}

export function PostUpdateForm({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(postJobUpdate, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="job_id" value={jobId} />
      <div className="grid gap-2">
        <Label htmlFor="update-message">Update</Label>
        <Textarea
          id="update-message"
          name="message"
          rows={2}
          placeholder="e.g. Parts arrived, work resuming today."
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="visible_to_customer"
          defaultChecked
          className="size-4"
        />
        Visible to customer
      </label>
      {state.error && <p className="text-destructive text-sm">{state.error}</p>}
      <div>
        <SubmitButton variant="secondary">Post update</SubmitButton>
      </div>
    </form>
  );
}

export function AddTaskForm({ jobId }: { jobId: string }) {
  const [state, action] = useActionState(addJobTask, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useToast(state, () => formRef.current?.reset());
  return (
    <form ref={formRef} action={action} className="flex items-end gap-3">
      <input type="hidden" name="job_id" value={jobId} />
      <div className="grid flex-1 gap-2">
        <Label htmlFor="task-title">New task</Label>
        <Input id="task-title" name="title" placeholder="e.g. Bleed brakes" required />
      </div>
      <SubmitButton variant="secondary">Add</SubmitButton>
    </form>
  );
}

export function ToggleTaskButton({
  id,
  jobId,
  isCompleted,
}: {
  id: string;
  jobId: string;
  isCompleted: boolean;
}) {
  const [state, action] = useActionState(toggleJobTask, initial);
  useToast(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="is_completed" value={(!isCompleted).toString()} />
      <Button type="submit" variant={isCompleted ? "ghost" : "outline"} size="sm">
        {isCompleted ? "Reopen" : "Complete"}
      </Button>
    </form>
  );
}
