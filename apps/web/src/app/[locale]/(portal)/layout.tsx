import { getTranslations } from "next-intl/server";

import { PortalNav } from "@/components/portal-nav";
import { ShellAccountMenu } from "@/components/shell-account-menu";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { getUser, requireCustomerPortal } from "@/lib/auth";

export async function generateMetadata() {
  const t = await getTranslations("metadata");
  return {
    title: t("portalTitle"),
    description: t("portalDescription"),
  };
}

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const t = await getTranslations("shell");
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();
  const primary = accounts[0]?.business;

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora Portal"
      brandSubtitle={primary?.name ?? t("customerPortalAccess")}
      nav={<PortalNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Customer"}
            title={primary?.name ?? t("customerPortalAccess")}
            subtitle={t("linkedAccounts", { count: accounts.length })}
          />
        ) : undefined
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Customer"}
            title={primary?.name ?? t("customerPortalAccess")}
            subtitle={t("linkedAccounts", { count: accounts.length })}
            footerNote={t("customerPortalAccess")}
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
