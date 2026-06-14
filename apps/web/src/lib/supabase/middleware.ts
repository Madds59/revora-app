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

/** Routes reachable without an authenticated session (checked on the de-localized path). */
function isPublicPath(rest: string): boolean {
  return rest === "/login" || rest === "/signup" || rest.startsWith("/auth");
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

  return response;
}
