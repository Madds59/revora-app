import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { signOut } from "@/app/[locale]/(auth)/actions";
import { Logo } from "@/components/brand";

/**
 * Moving `/settings/security` out of `(dashboard)` cost it the title that
 * layout's own `generateMetadata` supplied, dropping the page onto the
 * site-wide fallback. Restored here so it keeps a real, localized title —
 * the same treatment `/login/mfa` gets from `metadata.mfaTitle`.
 */
export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("securityTitle"),
    description: t("securityDescription"),
  };
}

/**
 * Account-level pages that must be reachable by ANY authenticated user,
 * whatever shell they normally live in (APPSEC-10 auth hardening, Task 7).
 *
 * WHY THIS GROUP EXISTS — this is load-bearing for redirect-loop safety, not
 * cosmetics. `/settings/security` is the destination Task 7's middleware gate
 * sends a platform admin with no verified factor to. While it lived under
 * `(dashboard)`, that layout's `requireMembership()` redirected any user
 * WITHOUT a business membership away — and for a platform admin specifically,
 * to `/admin`, which the gate then redirects straight back to
 * `/settings/security`. That is an infinite loop, and it lands on exactly the
 * user class the gate targets: a platform admin holding no business
 * membership (a case `requireMembership` and the onboarding page both already
 * handle explicitly, so it is a real account shape, not a hypothetical).
 *
 * No amount of redirect juggling fixes that from inside `(dashboard)`: its
 * layout cannot render without a business at all. The destination has to sit
 * outside it. It also makes the page reachable for customer-portal users, who
 * were previously bounced to `/portal` and so could never enroll.
 *
 * Deliberately does NOT guard auth itself — like the `(onboarding)` group,
 * each page owns that (the security page calls `requireUser()`), and the
 * middleware has already rejected anonymous requests to this path.
 */
export default async function AccountLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("shell");
  const tCommon = await getTranslations("common.actions");

  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-background flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground text-sm underline">
            {tCommon("back")}
          </Link>
          {/* An escape hatch that never depends on MFA succeeding: a user who
              cannot enroll (or has lost their authenticator) must always be
              able to leave rather than be trapped on this page. */}
          <form action={signOut}>
            <button type="submit" className="text-muted-foreground text-sm underline">
              {t("signOut")}
            </button>
          </form>
        </div>
      </header>
      <main className="bg-background mx-auto w-full max-w-3xl border-x">
        {children}
      </main>
    </div>
  );
}
