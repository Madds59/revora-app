import createMiddleware from "next-intl/middleware";
import { type NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Locale routing first: may redirect "/" -> "/en", "/login" -> "/en/login",
  //    or set the NEXT_LOCALE cookie on a pass-through response.
  const response = handleI18nRouting(request);

  // If next-intl issued a redirect (adding the locale prefix), honor it as-is;
  // the redirected request re-enters middleware and gets session handling then.
  if (response.headers.has("location")) {
    return response;
  }

  // 2. Refresh the Supabase session + enforce auth, attaching cookies to the
  //    next-intl response so locale handling and auth compose.
  return await updateSession(request, response);
}

export const config = {
  matcher: [
    /*
     * Run on everything EXCEPT:
     *  - api / auth   → self-authenticating routes (Stripe webhook, OAuth callback)
     *  - _next        → Next internals
     *  - any *.ext    → static + generated metadata files (icon.svg, manifest, etc.)
     *  - apple-icon / opengraph-image → extensionless metadata routes
     */
    "/((?!api|auth|_next|.*\\..*|apple-icon|opengraph-image).*)",
  ],
};
