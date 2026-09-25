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

/**
 * Server-only synchronous check for gating in-context entry points (CTAs,
 * cards, nav-adjacent buttons) that link into an optional module's routes,
 * without a redirect. Use this where `requireFeature` doesn't fit — e.g. a
 * button rendered on an always-visible page that merely links to a gated
 * route; the route itself still calls `requireFeature`.
 *
 * Reads `process.env.NEXT_PUBLIC_REVORA_FEATURES` via the same static
 * reference style as `requireFeature` on purpose — see the build-time-only
 * warning above. This function is server-only, so it always sees the real
 * env at request time; it is the client bundle's copy of this same variable
 * that is frozen at build time.
 */
export function isFeatureOn(key: FeatureKey): boolean {
  return resolveFeatures(process.env.NEXT_PUBLIC_REVORA_FEATURES)[key];
}
