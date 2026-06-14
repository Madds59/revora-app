import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run the Supabase session middleware on all routes EXCEPT:
     *  - api          → routes authenticate themselves (e.g. the Stripe webhook
     *                   verifies its signature and must never be redirected).
     *  - _next        → all Next internals (static, image, data, ...).
     *  - any *.ext     → static files AND generated metadata files such as
     *                   icon.svg, manifest.webmanifest, favicon.ico, robots.txt,
     *                   sitemap.xml — these are fetched by crawlers/PWA clients
     *                   that have no session and must not be redirected to /login.
     *  - apple-icon / opengraph-image → metadata routes with no extension that
     *                   would otherwise be gated (breaking link previews & icons).
     */
    "/((?!api|_next|.*\\..*|apple-icon|opengraph-image).*)",
  ],
};
