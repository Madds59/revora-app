import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { IMPORT_TEMPLATES } from "@/lib/import-templates";

export default async function ImportTemplatesPage() {
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const t = await getTranslations("importTemplates");
  const guidanceTips = t.raw("guidance.tips") as string[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/implementation" className={buttonVariants({ variant: "secondary" })}>
            {t("actions.back")}
          </Link>
        }
      />

      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("guidance.title")}</CardTitle>
            <CardDescription>{t("guidance.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {guidanceTips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {IMPORT_TEMPLATES.map((template) => (
            <Card key={template.slug}>
              <CardHeader>
                <CardTitle>{template.title[locale]}</CardTitle>
                <CardDescription>{template.description[locale]}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-3">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t("headers.title")}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {template.headers.map((header) => (
                      <code
                        key={header}
                        className="rounded-md border bg-muted px-2 py-1 text-xs"
                      >
                        {header}
                      </code>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wide">
                    {t("tips.title")}
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {template.tips[locale].map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </div>

                <a
                  href={`/api/launch-ops/templates/${template.slug}`}
                  className={buttonVariants({ className: "w-full" })}
                >
                  {t("download")}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
