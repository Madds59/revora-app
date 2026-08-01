import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeInternalRedirect } from "@/lib/validation/onboarding";

/**
 * OAuth / magic-link / email-confirmation callback. Supabase redirects here
 * with a `code` that we exchange for a session cookie, then forward the user on.
 *
 * `next` is attacker-controllable, so it is reduced to a safe INTERNAL path
 * before being appended to the origin. Concatenating it raw was an open
 * redirect: `next=@evil.example` produces `https://<origin>@evil.example`, where
 * the origin is parsed as userinfo and the real host becomes `evil.example` — a
 * link on the genuine Revora domain would hand the freshly signed-in user to an
 * attacker's site.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalRedirect(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback`);
}
