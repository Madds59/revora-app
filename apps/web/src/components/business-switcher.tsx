"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormState = { error?: string; message?: string };
type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export type BusinessOption = {
  id: string;
  label: string;
  detail: string;
};

const initial: FormState = {};

export function BusinessSwitcher({
  action,
  options,
  activeBusinessId,
}: {
  action: Action;
  options: BusinessOption[];
  activeBusinessId: string;
}) {
  const [state, formAction] = useActionState(action, initial);
  const [selectedBusinessId, setSelectedBusinessId] = useState(activeBusinessId);
  const lastMessage = useRef<string | undefined>(undefined);
  const router = useRouter();
  const selectedBusiness = useMemo(
    () => options.find((option) => option.id === selectedBusinessId) ?? options[0],
    [options, selectedBusinessId],
  );

  useEffect(() => {
    if (state.message && state.message !== lastMessage.current) {
      lastMessage.current = state.message;
      toast.success(state.message);
      router.refresh();
    }
    if (state.error && state.error !== lastMessage.current) {
      lastMessage.current = state.error;
      toast.error(state.error);
    }
  }, [router, state.error, state.message]);

  if (options.length <= 1) {
    const option = options[0];
    if (!option) return null;

    return (
      <div className="border-sidebar-border bg-sidebar-accent/40 grid gap-1 rounded-lg border p-3">
        <p className="text-sidebar-foreground/50 text-[10px] font-medium uppercase tracking-wide">
          Active business
        </p>
        <p className="text-sidebar-foreground text-sm font-medium">
          {option.label}
        </p>
        <p className="text-sidebar-foreground/55 text-xs">{option.detail}</p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="border-sidebar-border bg-sidebar-accent/40 grid gap-3 rounded-lg border p-3"
    >
      <input type="hidden" name="business_id" value={selectedBusinessId} />

      <div className="grid gap-2">
        <Label htmlFor="business_id" className="text-sidebar-foreground/70">
          Active business
        </Label>
        <Select
          name="business_id"
          value={selectedBusinessId}
          onValueChange={(value) => setSelectedBusinessId(value ?? "")}
        >
          <SelectTrigger id="business_id" className="w-full">
            <SelectValue placeholder="Select business" />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-sidebar/60 text-sidebar-foreground/60 rounded-md px-3 py-2 text-xs">
        {selectedBusiness?.detail}
      </div>

      <SubmitButton variant="secondary" className="w-full">
        <ChevronDown />
        Switch business
      </SubmitButton>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
