import { cn } from "@/lib/utils";

/**
 * Inline server-action error. `role="alert"` makes assistive technology
 * announce it when it appears (WCAG 3.3.1) — a plain red <p> is visible but
 * silent. Renders nothing when there is no message so it can sit permanently
 * in a form.
 */
export function FormError({
  message,
  className,
}: {
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("text-destructive text-sm", className)}>
      {message}
    </p>
  );
}
