import { createServerClient } from "@supabase/ssr";
import { hasLocale } from "next-intl";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/database.types";
import { routing } from "@/i18n/routing";

/** Split a locale-prefixed path into its locale and the remaining (de-localized) path. */
function splitLocale(pathname: string): { locale: string; rest: string } {
  const segments = pathname.split("/");
  if (hasLocale(routing.locales, segments[1])) {
    return { locale: segments[1], rest: "/" + segments.slice(2).join("/") };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

/**
 * Public inspection share links: `/i/<43-char base64url token>`.
 *
 * Deliberately an EXACT shape, not a `startsWith("/i")` directory exemption --
 * this is the application's only unauthenticated data surface, so the exemption
 * is written so that nothing else can ever be reached through it. A token is 32
 * random bytes rendered base64url, which is exactly 43 characters. Anything
 * else under `/i` (including `/i`, `/i/`, a shorter token, or a nested path)
 * falls through to the normal auth gate and redirects to login.
 *
 * ACCEPTED CONSEQUENCE: a MALFORMED token therefore redirects to /login, while
 * a well-formed one that does not resolve renders the generic "not available"
 * page. Those two are distinguishable. That is a deliberate trade -- the exact
 * regex is the stronger control, because nothing but a correctly-shaped token
 * can reach an unauthenticated render at all -- and it leaks nothing: it
 * reveals only that 43 base64url characters is the token format, which the
 * holder of any link already knows. The property that actually matters is that
 * every WELL-FORMED token produces a byte-identical response whether it is
 * unknown, expired or revoked, so the route is not an existence oracle. That
 * is asserted end to end; see supabase/tests/dvi_security_tests.sql
 * (T-ANON-RESOLVER) for the database half.
 */
const SHARE_LINK_PATH = /^\/i\/[A-Za-z0-9_-]{43}$/;

export function isInspectionSharePath(rest: string): boolean {
  return SHARE_LINK_PATH.test(rest);
}

/** Routes reachable without an authenticated session (checked on the de-localized path). */
function isPublicPath(rest: string): boolean {
  return (
    rest === "/login" ||
    rest === "/signup" ||
    rest === "/forgot-password" ||
    rest.startsWith("/auth") ||
    isInspectionSharePath(rest)
  );
}

/**
 * Headers for the public share route (spec section 13).
 *
 * The token sits in the URL path, so the page must not be cached by any shared
 * cache, must not leak the URL through `Referer` when the customer clicks a
 * photo, and must never be indexed. `X-Robots-Tag` is set here in addition to
 * the page's own `<meta name="robots">` so the directive survives even if the
 * crawler only reads headers.
 */
function applyShareLinkHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
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
  const { locale, rest } = splitLocale(request.nextUrl.pathname);

  // A share link is unauthenticated by design. Return before any auth work so
  // the request neither reads nor rewrites session cookies, and so the token in
  // the path is never handed to the auth client.
  if (isInspectionSharePath(rest)) {
    return applyShareLinkHeaders(response);
  }

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

  return response;
}
