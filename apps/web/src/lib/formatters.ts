export type AppLocale = "en" | "ar";

const AED_LOCALE = "en-AE";
const ARABIC_LOCALE = "ar-AE";
const LATN_NUMBERING = { numberingSystem: "latn" as const };
const DUBAI_TIME_ZONE = "Asia/Dubai";

function toValidDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getIntlLocale(locale: AppLocale = "en"): string {
  return locale === "ar" ? ARABIC_LOCALE : AED_LOCALE;
}

export function formatAED(
  value: number | null | undefined,
  options?: Intl.NumberFormatOptions,
  locale: AppLocale = "en",
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(getIntlLocale(locale), {
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
  locale: AppLocale = "en",
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(getIntlLocale(locale), {
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
  locale: AppLocale = "en",
): string {
  const date = toValidDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
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
  locale: AppLocale = "en",
): string {
  const date = toValidDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
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
  locale: AppLocale = "en",
): string {
  if (value == null) return "—";
  return new Intl.NumberFormat(getIntlLocale(locale), {
    ...LATN_NUMBERING,
    ...options,
  }).format(value);
}
