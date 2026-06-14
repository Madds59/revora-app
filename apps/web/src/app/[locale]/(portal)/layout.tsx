import { PortalNav } from "@/components/portal-nav";
import { ShellAccountMenu } from "@/components/shell-account-menu";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { getUser, requireCustomerPortal } from "@/lib/auth";

export default async function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { accounts } = await requireCustomerPortal();
  const user = await getUser();
  const primary = accounts[0]?.business;

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora Portal"
      brandSubtitle={primary?.name ?? "Customer access"}
      nav={<PortalNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Customer"}
            title={primary?.name ?? "Customer access"}
            subtitle={`${accounts.length} linked account${accounts.length === 1 ? "" : "s"}`}
          />
        ) : undefined
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Customer"}
            title={primary?.name ?? "Customer access"}
            subtitle={`${accounts.length} linked account${accounts.length === 1 ? "" : "s"}`}
            footerNote="Customer portal access"
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
