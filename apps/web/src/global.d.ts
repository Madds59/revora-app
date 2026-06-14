import type { routing } from "@/i18n/routing";
import type messages from "./messages/en.json";

// Type-safe message keys + Locale across the app (Paraglide-style discipline on
// top of next-intl): t('...') autocompletes and unknown keys are compile errors.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
