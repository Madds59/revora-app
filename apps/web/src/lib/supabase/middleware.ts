import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import { routing } from "@/i18n/routing";
import { MFA_CHALLENGE_PATH, mfaRedirectFor } from "@/lib/mfa-gate";

/** Split a locale-prefixed path into its locale and the remaining (de-localized) path. */
function splitLocale(pathname: string): { locale: string; rest: string } {
  const segments = pathname.split("/");
  if (hasLocale(routing.locales, segments[1])) {
    return { locale: segments[1], rest: "/" + segments.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

/**
 * Routes reachable without an authenticated session (checked on the de-localized path).
 *
 * `/login/mfa` is public in the sense that matters here — the MFA challenge is
 * reached by a session that exists but has not yet satisfied its second factor,
 * and the page itself sends a genuinely signed-out visitor to /login. Leaving it
 * out would be harmless for signed-in users but would make the page a dead end
 * for anyone whose session expired while it was open.
 */
function isPublicPath(rest: string): boolean {
  return (
    rest === "/login" ||
    rest === MFA_CHALLENGE_PATH ||
    rest === "/signup" ||
    rest === "/forgot-password" ||
    rest.startsWith("/auth")
  );
}

/**
 * The MFA decision for an authenticated request, or null when nothing is
 * required. All policy lives in `mfaRedirectFor` (lib/mfa-gate.js) — this
 * function only gathers its inputs, so the redirect behaviour stays testable
 * offline and there is exactly one place the rules can be read.
 *
 * COST: `getAuthenticatorAssuranceLevel()` is computed from the session that
 * `getUser()` already refreshed — it makes no additional network call. The
 * `platform_admins` lookup DOES cost a round trip, so it is issued only for
 * requests under /admin, which are the only requests where the answer can
 * change the outcome (both admin rules in `mfaRedirectFor` are scoped to
 * /admin as of the 2026-08-22 amendment). A plain dashboard navigation
 * therefore gains no extra query.
 *
 * NOTE: `isSuperAdmin` from lib/auth.ts is deliberately NOT used here — it
 * builds its client via lib/supabase/server.ts, which calls `cookies()` from
 * next/headers, which does not exist in middleware. The request-scoped client
 * constructed in `updateSession` is passed in instead.
 */
async function mfaDecision(
  supabase: SupabaseClient<Database>,
  userId: string,
  rest: string,
): Promise<string | null> {
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aal) {
    // Fails OPEN, and only on a session we could not read an AAL from at all
    // (`getUser()` above already established there IS a session). Failing
    // closed here would mean redirecting on a state we cannot evaluate, which
    // is how redirect loops get built. Curated: only the code is logged.
    console.error("mfa_aal_lookup_error", error?.code ?? "unknown");
    return null;
  }

  // `nextLevel === "aal2"` is derived by the SDK from VERIFIED factors only, so
  // an abandoned (unverified) enrollment can never satisfy the gate.
  const hasVerifiedFactor = aal.nextLevel === "aal2";

  let isSuperAdmin = false;
  if (rest === "/admin" || rest.startsWith("/admin/")) {
    const { data } = await supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    isSuperAdmin = !!data;
  }

  return mfaRedirectFor({
    currentLevel: aal.currentLevel,
    nextLevel: aal.nextLevel,
    isSuperAdmin,
    hasVerifiedFactor,
    path: rest,
  });
}

/**
 * Refreshes the Supabase auth session and enforces locale-aware route protection.
 * Cookies are written onto the passed `response` (the next-intl response) so locale
 * handling and session refresh compose. Returns a locale-prefixed redirect when the
 * auth gate trips, otherwise the (cookie-updated) response.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient<Database>(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() (not getSession()) revalidates the token with Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { locale, rest } = splitLocale(request.nextUrl.pathname);

  if (!user && !isPublicPath(rest)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  if (user && (rest === "/login" || rest === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}`;
    return NextResponse.redirect(url);
  }

  if (user) {
    const mfaTarget = await mfaDecision(supabase, user.id, rest);
    if (mfaTarget) {
      // Built from scratch rather than cloned: the original query string
      // belongs to the page we are leaving, and carrying it onto the gate page
      // would let arbitrary request parameters ride along. The only parameter
      // that survives is `next`, and it is written here from a path this
      // middleware derived from the request itself — never from user input.
      const url = new URL(`/${locale}${mfaTarget}`, request.nextUrl.origin);
      if (mfaTarget === MFA_CHALLENGE_PATH) {
        url.searchParams.set("next", rest);
      }
      return NextResponse.redirect(url);
    }
  }

  return response;
}
