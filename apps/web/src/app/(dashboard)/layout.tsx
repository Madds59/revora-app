import { setActiveBusiness } from "@/app/(dashboard)/actions";
import { BusinessSwitcher, type BusinessOption } from "@/components/business-switcher";
import { DashboardNav } from "@/components/dashboard-nav";
import { ShellAccountMenu, type ShellMenuLink } from "@/components/shell-account-menu";
import { getUser, getCurrentMemberships, isSuperAdmin, requireMembership } from "@/lib/auth";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { ROLE_LABELS } from "@/lib/permissions";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { member, business } = await requireMembership();
  const user = await getUser();
  const memberships = await getCurrentMemberships();
  const superAdmin = await isSuperAdmin();
  const businessOptions: BusinessOption[] = memberships.map((membership) => ({
    id: membership.business.id,
    label: membership.business.name,
    detail: `${membership.business.legal_name ?? membership.business.name} · ${ROLE_LABELS[membership.member.role]}`,
  }));
  const accountLinks: ShellMenuLink[] = [
    { href: "/settings", label: "Business settings", icon: "settings" as const },
    { href: "/billing", label: "Billing", icon: "billing" as const },
    ...(superAdmin
      ? [{ href: "/admin", label: "Platform admin", icon: "admin" as const }]
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
            title={ROLE_LABELS[member.role]}
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
            title={ROLE_LABELS[member.role]}
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
