import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FileWarning } from "lucide-react";

import { StatusBanner } from "@/components/status-banner";
import { getBusinessDetails } from "@/lib/legal/business.js";
import {
  LEGAL_REVIEW_STATUS,
  LEGAL_SLUGS,
  getLegalDocument,
  isLegalSlug,
  renderLegalText,
} from "@/lib/legal/index.js";
import type { LegalSlug } from "@/lib/legal/types";
import { formatDate } from "@/lib/formatters";
import { normalizeLocale } from "@/lib/locale-path.js";

type Params = Promise<{ locale: string; slug: string }>;

export function generateStaticParams() {
  return LEGAL_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const doc = getLegalDocument(slug as LegalSlug, locale);
  return { title: doc.title, description: doc.intro[0] };
}

export default async function LegalDocumentPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!isLegalSlug(slug)) notFound();

  const locale = normalizeLocale(await getLocale());
  const t = await getTranslations("legal.page");
  const business = getBusinessDetails();
  const doc = getLegalDocument(slug as LegalSlug, locale);
  const render = (text: string) => renderLegalText(text, business);

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t("lastUpdated", { date: formatDate(doc.updated, undefined, locale) })}
        </p>
      </header>

      {LEGAL_REVIEW_STATUS === "draft" && (
        <StatusBanner tone="muted" icon={FileWarning} title={t("draftTitle")}>
          <p>{t("draftBody")}</p>
        </StatusBanner>
      )}

      <div className="flex flex-col gap-4 text-base leading-7">
        {doc.intro.map((paragraph, i) => (
          <p key={i}>{render(paragraph)}</p>
        ))}
      </div>

      {doc.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-3">
          <h2 className="font-heading text-xl font-semibold tracking-tight">{section.heading}</h2>
          {section.paragraphs.map((paragraph, i) => (
            <p key={i} className="leading-7">
              {render(paragraph)}
            </p>
          ))}
          {section.bullets && (
            <ul className="ms-5 flex list-disc flex-col gap-2 leading-7">
              {section.bullets.map((bullet, i) => (
                <li key={i}>{render(bullet)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
