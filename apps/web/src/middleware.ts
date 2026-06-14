import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run the Supabase session middleware on all routes EXCEPT API routes
     * (which authenticate themselves — e.g. the Stripe webhook verifies its
     * signature and must never be redirected to /login), Next internals, and
     * static assets.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|manifest.webmanifest).*)",
  ],
};
