"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { UserRoundPen } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type ComplaintAssigneeOption = {
  id: string;
  label: string;
};

const initial: FormState = {};

export function ComplaintAssignmentModal({
  action,
  complaintId,
  currentAssigneeId,
  assignees,
}: {
  action: Action;
  complaintId: string;
  currentAssigneeId: string | null;
  assignees: ComplaintAssigneeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(action, initial);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      setOpen(false);
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [state.error, state.message]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="w-full sm:w-auto">
            <UserRoundPen />
            Change assignee
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change assignee</DialogTitle>
          <DialogDescription>
            Move this complaint to another active team member or clear the assignment.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="complaint_id" value={complaintId} />

          <div className="grid gap-2">
            <Label htmlFor="assigned_to">Assigned to</Label>
            <Select name="assigned_to" defaultValue={currentAssigneeId ?? ""}>
              <SelectTrigger id="assigned_to" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {assignees.map((assignee) => (
                  <SelectItem key={assignee.id} value={assignee.id}>
                    {assignee.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <DialogFooter className={cn("px-0 pb-0 pt-2")}>
            <Button type="submit" className="w-full sm:w-auto">
              Save assignment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
