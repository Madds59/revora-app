import { getTranslations } from "next-intl/server";

import { setActiveBusiness } from "@/app/[locale]/(dashboard)/actions";
import { BusinessSwitcher, type BusinessOption } from "@/components/business-switcher";
import { DashboardNav } from "@/components/dashboard-nav";
import { ShellAccountMenu, type ShellMenuLink } from "@/components/shell-account-menu";
import { getUser, getCurrentMemberships, isSuperAdmin, requireMembership } from "@/lib/auth";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { ROLE_LABELS } from "@/lib/permissions";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("dashboardTitle"),
    description: t("dashboardDescription"),
  };
}

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("shell");
  const { member, business } = await requireMembership();
  const user = await getUser();
  const memberships = await getCurrentMemberships();
  const superAdmin = await isSuperAdmin();
  const businessOptions: BusinessOption[] = memberships.map((membership) => {
    const role = membership.member.role as keyof typeof ROLE_LABELS;
    return {
      id: membership.business.id,
      label: membership.business.name,
      detail: `${membership.business.legal_name ?? membership.business.name} · ${ROLE_LABELS[role]}`,
    };
  });
  const memberRole = member.role as keyof typeof ROLE_LABELS;
  const accountLinks: ShellMenuLink[] = [
    { href: "/settings", label: t("businessSettings"), icon: "settings" as const },
    { href: "/billing", label: t("billing"), icon: "billing" as const },
    ...(superAdmin
      ? [{ href: "/admin", label: t("platformAdmin"), icon: "admin" as const }]
      : []),
  ];

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora"
      brandSubtitle={business.name}
      nav={<DashboardNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Signed-in user"}
            title={ROLE_LABELS[memberRole]}
            subtitle={business.name}
            links={accountLinks}
          />
        ) : undefined
      }
      sidebarTop={
        <BusinessSwitcher
          action={setActiveBusiness}
          options={businessOptions}
          activeBusinessId={business.id}
        />
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Signed-in user"}
            title={ROLE_LABELS[memberRole]}
            subtitle={business.name}
            links={accountLinks}
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
