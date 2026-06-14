import { AdminNav } from "@/components/admin-nav";
import { ResponsiveSidebarShell } from "@/components/responsive-sidebar-shell";
import { ShellAccountMenu } from "@/components/shell-account-menu";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireSuperAdmin();

  return (
    <ResponsiveSidebarShell
      brandTitle="Revora Admin"
      brandSubtitle="Platform console"
      nav={<AdminNav />}
      mobileHeaderEnd={
        user ? (
          <ShellAccountMenu
            compact
            email={user.email ?? "Platform admin"}
            title="Platform console"
            subtitle="Admin access"
            footerNote="Platform owner"
          />
        ) : undefined
      }
      sidebarFooter={
        user ? (
          <ShellAccountMenu
            email={user.email ?? "Platform admin"}
            title="Platform console"
            subtitle={user.email}
            footerNote="Platform owner"
          />
        ) : undefined
      }
    >
      {children}
    </ResponsiveSidebarShell>
  );
}
