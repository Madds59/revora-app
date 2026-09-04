import { getTranslations } from "next-intl/server";

import { AdminNav } from "@/components/admin-nav";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { ShellAccountMenu, type ShellMenuLink } from "@/components/shell-account-menu";
import { getCurrentMemberships, requireSuperAdmin } from "@/lib/auth";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("adminTitle"),
    description: t("adminDescription"),
  };
}

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("shell");
  const user = await requireSuperAdmin();
  // Platform-only admins have no business to return to, and `requireMembership`
  // would bounce them straight back here, so only offer the link when they do.
  const memberships = await getCurrentMemberships();
  const accountLinks: ShellMenuLink[] =
    memberships.length > 0
      ? [{ href: "/", label: t("businessDashboard"), icon: "dashboard" as const }]
      : [];

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora Admin"
      brandSubtitle={t("platformConsole")}
      nav={<AdminNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Platform admin"}
            title={t("platformConsole")}
            subtitle={t("adminAccess")}
            links={accountLinks}
            footerNote={t("platformOwner")}
          />
        ) : undefined
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Platform admin"}
            title={t("platformConsole")}
            subtitle={user.email}
            links={accountLinks}
            footerNote={t("platformOwner")}
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
