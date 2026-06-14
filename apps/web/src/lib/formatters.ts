const AED_LOCALE = "en-AE";
const LATN_NUMBERING = { numberingSystem: "latn" as const };
const DUBAI_TIME_ZONE = "Asia/Dubai";

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAED(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(AED_LOCALE, {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...LATN_NUMBERING,
    ...options,
  }).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "AED",
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(AED_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...LATN_NUMBERING,
    ...options,
  }).format(value);
}

export function formatDate(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toValidDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(AED_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DUBAI_TIME_ZONE,
    ...LATN_NUMBERING,
    ...options,
  }).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toValidDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(AED_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: DUBAI_TIME_ZONE,
    ...LATN_NUMBERING,
    ...options,
  }).format(date);
}

export function formatNumber(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(AED_LOCALE, {
    ...LATN_NUMBERING,
    ...options,
  }).format(value);
}
