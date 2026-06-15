export type RetainerAnalyticsMetadata = {
  business_id?: string;
  role?: string | null;
  service_category?: string;
  billing_cycle?: string;
  margin_range?: string;
  contract_length?: string;
};

/**
 * Safe no-op analytics hook for retainer pricing events.
 * The repo does not currently wire PostHog, so this intentionally does nothing.
 */
export async function trackRetainerEvent(
  _name: string,
  _metadata: RetainerAnalyticsMetadata,
): Promise<void> {
  void _name;
  void _metadata;
  return;
}

export function captureRetainerError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (typeof console !== "undefined") {
    console.error(error, context);
  }
}
