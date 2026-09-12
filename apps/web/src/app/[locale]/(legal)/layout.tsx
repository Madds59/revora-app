import { getTranslations } from "next-intl/server";

import { Logo } from "@/components/brand";
import { LegalFooter } from "@/components/legal-footer";
import { Link } from "@/i18n/navigation";
import { LEGAL_SLUGS } from "@/lib/legal/index.js";

/**
 * Public legal pages. No session is required (see isPublicPath in
 * lib/supabase/middleware.ts), so this layout must not call any auth guard.
 */
export default async function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("legal");

  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/" aria-label={t("page.backToApp")}>
            <Logo />
          </Link>
          <nav aria-label={t("nav.legal")} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {LEGAL_SLUGS.map((slug) => (
              <Link
                key={slug}
                href={`/legal/${slug}`}
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                {t(`nav.${slug}`)}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        {children}
      </main>
      <div className="border-border border-t">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <LegalFooter />
        </div>
      </div>
    </div>
  );
}
