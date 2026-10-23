import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getBusinessDetails } from "@/lib/legal/business.js";
import { LEGAL_SLUGS } from "@/lib/legal/index.js";
import { cn } from "@/lib/utils";

/**
 * Business details + legal links. Rendered on every unauthenticated surface
 * (auth layout, legal pages) so the controller identity required by the UAE
 * PDPL is never more than one click away. When the NEXT_PUBLIC_LEGAL_* vars
 * are unset it shows a visible configuration hint rather than nothing.
 */
export async function LegalFooter({
  tone = "default",
  className,
}: {
  tone?: "default" | "inverted";
  className?: string;
}) {
  const t = await getTranslations("legal");
  const business = getBusinessDetails();
  const year = new Date().getFullYear();

  const muted =
    tone === "inverted" ? "text-sidebar-foreground/60" : "text-muted-foreground";
  const link =
    tone === "inverted"
      ? "text-sidebar-foreground/80 hover:text-sidebar-foreground"
      : "text-foreground/80 hover:text-foreground";

  return (
    <footer className={cn("flex flex-col gap-3 text-xs", muted, className)}>
      <nav aria-label={t("nav.legal")} className="flex flex-wrap gap-x-4 gap-y-1">
        {LEGAL_SLUGS.map((slug) => (
          <Link key={slug} href={`/legal/${slug}`} className={cn("underline-offset-4 hover:underline", link)}>
            {t(`nav.${slug}`)}
          </Link>
        ))}
      </nav>
      {business.isConfigured ? (
        <address className="flex flex-col gap-0.5 not-italic">
          <span>{t("footer.operatedBy", { entityName: business.entityName })}</span>
          <span>
            {business.address} · {t(`footer.jurisdiction.${business.jurisdiction}`)}
          </span>
          {business.license && (
            <span>{t("footer.license", { license: business.license })}</span>
          )}
          <span>
            {t("footer.contact")}:{" "}
            <a href={`mailto:${business.email}`} className={cn("underline-offset-4 hover:underline", link)}>
              {business.email}
            </a>
          </span>
        </address>
      ) : (
        <p
          role="note"
          className="text-foreground border-warning/50 bg-warning/15 rounded-md border px-2 py-1"
        >
          {t("footer.notConfigured")}
        </p>
      )}
      <span>{t("footer.rights", { year, entityName: business.entityName })}</span>
    </footer>
  );
}
