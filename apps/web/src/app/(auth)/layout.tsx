import { ShieldCheck, FileCheck2, MessageSquareHeart } from "lucide-react";

import { Logo, FlagStripe } from "@/components/brand";

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Built on trust",
    body: "Transparent quotes and a verifiable record customers can rely on.",
  },
  {
    icon: FileCheck2,
    title: "Digital approvals",
    body: "Signed, audited sign-off on every job — no more disputes.",
  },
  {
    icon: MessageSquareHeart,
    title: "Resolve with care",
    body: "Complaints handled in the open, start to finish.",
  },
];

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* Brand panel — graphite with the trust story. Hidden on small screens. */}
      <aside className="bg-sidebar text-sidebar-foreground relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        <div
          aria-hidden
          className="bg-brand-green/20 pointer-events-none absolute -end-24 -top-24 size-72 rounded-full blur-3xl"
        />
        <Logo
          subtitle="Built on Trust. Powered by Operations."
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
          <span className="text-sidebar-foreground/45 text-xs">
            Made for UAE service businesses
          </span>
        </div>
      </aside>

      {/* Form column. */}
      <div className="bg-muted/30 flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <div className="flex flex-col items-center gap-1 text-center lg:hidden">
          <Logo />
          <span className="text-muted-foreground text-sm">
            Built on Trust. Powered by Operations.
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
