import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  // Always prefix the URL with the locale (/en, /ar).
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/** Reading direction for a locale. Arabic is the only RTL locale today. */
export function localeDirection(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
