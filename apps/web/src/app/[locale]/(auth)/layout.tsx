import { ShieldCheck, FileCheck2, MessageSquareHeart } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Logo, FlagStripe } from "@/components/brand";

export default async function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("auth.layout");

  const TRUST_POINTS = [
    {
      icon: ShieldCheck,
      title: t("trustBuilt"),
      body: t("trustBuiltBody"),
    },
    {
      icon: FileCheck2,
      title: t("digitalApprovals"),
      body: t("digitalApprovalsBody"),
    },
    {
      icon: MessageSquareHeart,
      title: t("resolveWithCare"),
      body: t("resolveWithCareBody"),
    },
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel — graphite with the trust story. Hidden on small screens. */}
      <aside className="bg-sidebar text-sidebar-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="bg-brand-green/20 pointer-events-none absolute -end-24 -top-24 size-72 rounded-full blur-3xl"
        />
        <Logo
          subtitle={t("tagline")}
          tone="inverted"
          className="relative"
        />

        <div className="relative flex flex-col gap-7">
          {TRUST_POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex items-start gap-4">
              <div className="bg-sidebar-accent text-sidebar-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="size-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="font-heading text-sm font-semibold">{title}</p>
                <p className="text-sidebar-foreground/60 text-sm">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex items-center gap-3">
          <FlagStripe className="max-w-24 rounded-full" />
          <span className="text-sidebar-foreground/45 text-xs">{t("madeForUAE")}</span>
        </div>
      </aside>

      {/* Form column. */}
      <div className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center lg:hidden">
          <Logo />
          <span className="text-muted-foreground text-sm">{t("tagline")}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
