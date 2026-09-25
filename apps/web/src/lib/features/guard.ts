import "server-only";

import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { resolveFeatures } from "@/lib/features/flags";
import type { FeatureKey } from "@/lib/features/types";

/**
 * Guards a route belonging to an optional module. Mirrors the
 * requireMembership() idiom: redirect, never 404 — a bookmarked URL for a
 * finished feature should degrade, not look broken.
 *
 * Uses the locale-aware redirect so an Arabic user stays on /ar.
 *
 * Signature verified against next-intl 4.13.0: redirect({ href, locale }).
 * routing.ts defines no `pathnames`, so `href` accepts a plain
 * { pathname, query } object.
 */
export async function requireFeature(
  key: FeatureKey,
  surface: "dashboard" | "portal" = "dashboard",
): Promise<void> {
  const features = resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES);
  if (features[key]) return;

  const locale = await getLocale();
  const pathname = surface === "portal" ? "/portal" : "/";
  redirect({ href: { pathname, query: { disabled: key } }, locale });
}
