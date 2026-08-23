import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { buildLoginPath } from "@/lib/auth-links";
import { formatDate, type AppLocale } from "@/lib/formatters";
import { switchLocalePath } from "@/lib/locale-path";
import { challengePageMode, MFA_CHALLENGE_PATH, safeReturnPath } from "@/lib/mfa-gate";
import { createClient } from "@/lib/supabase/server";

import { MfaChallengeClient, type MfaChallengeFactor } from "./mfa-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: t("mfaTitle"),
    description: t("mfaDescription"),
  };
}

/**
 * The sign-in second-factor challenge (APPSEC-10 auth hardening, Task 7).
 *
 * Reached when `lib/mfa-gate.js` decides a session holding a verified factor
 * has not yet satisfied it. Listed in `isPublicPath` (lib/supabase/middleware.ts)
 * so an AAL1 session is not bounced back to /login before it can get here.
 *
 * REDIRECT-LOOP DISCIPLINE — this page is a redirect DESTINATION, so every
 * redirect it issues itself is a loop candidate:
 *   - It leaves only when it can POSITIVELY establish there is nothing to do
 *     (already AAL2, or no verified factor exists at all). If the AAL lookup
 *     cannot be read, it RENDERS rather than redirects: the middleware makes
 *     the same lookup, so redirecting on a state we failed to read is exactly
 *     how a page and its gate start bouncing a request between them.
 *   - The "no factors listed" and "listFactors failed" branches render a card
 *     with a sign-out escape instead of redirecting, for the same reason. Which
 *     of those two it is decides the affordance shown — `challengePageMode`
 *     owns that call, because offering "set up an authenticator" to a user who
 *     provably has one links them to a page the gate immediately bounces back
 *     here.
 *   - `mfaRedirectFor` independently returns null for this path, so the
 *     middleware can never redirect a request that is already here.
 */
export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const locale = (await getLocale()) as AppLocale;
  const params = searchParams ? await searchParams : undefined;
  const next = safeReturnPath(params?.next);
  const onward = switchLocalePath(next, locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(buildLoginPath(locale));

  const { data: aal, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalError) console.error("mfa_aal_lookup_error", aalError.code ?? "unknown");

  if (aal && (aal.currentLevel === "aal2" || aal.nextLevel !== "aal2")) {
    redirect(onward);
  }

  // `.data.totp` is typed by the SDK as VERIFIED-only — an abandoned,
  // unverified enrollment never appears here and so can never be offered as
  // something to challenge against.
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) console.error("mfa_list_factors_error", error.code ?? "unknown");

  const factors: MfaChallengeFactor[] = (data?.totp ?? []).map((factor) => ({
    id: factor.id,
    addedOnLabel: formatDate(factor.created_at, undefined, locale),
  }));

  // An empty list means two different things depending on what the AAL read
  // said, and the difference decides whether offering enrollment is helpful or
  // actively misleading — see `challengePageMode`. The AAL read is the ONLY
  // signal used here: no extra round trip, and a failed read arrives as
  // `false` rather than as a guess.
  const mode = challengePageMode({
    hasVerifiedFactor: aal?.nextLevel === "aal2",
    listedFactorCount: factors.length,
  });

  // Retry for the transient case: a plain href back to this same URL, so the
  // whole server render (AAL read + listFactors) runs again. `mfaRedirectFor`
  // returns null for its own path, so this cannot bounce.
  const retryHref =
    switchLocalePath(MFA_CHALLENGE_PATH, locale) +
    (next === "/" ? "" : `?next=${encodeURIComponent(next)}`);

  return (
    <MfaChallengeClient
      factors={factors}
      mode={mode}
      next={next}
      retryHref={retryHref}
    />
  );
}
