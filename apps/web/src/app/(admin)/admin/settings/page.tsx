import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminSettingsPage() {
  const user = await requireSuperAdmin();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform-level controls and operational context."
      />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Current admin</CardTitle>
              <CardDescription>Signed-in platform operator.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              <div className="font-medium">{user.email}</div>
              <div className="text-muted-foreground text-xs">
                Platform access is governed by `platform_admins`.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tenant isolation</CardTitle>
              <CardDescription>RLS and security-definer boundaries.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Customer and business data stay tenant-scoped. Cross-tenant access
              happens only through admin RPCs.
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin surfaces</CardTitle>
              <CardDescription>Manage platform access and visibility.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link href="/admin/admins" className={buttonVariants({ variant: "outline" })}>
                Super admins
              </Link>
              <Link href="/admin/tenants" className={buttonVariants({ variant: "outline" })}>
                Tenants
              </Link>
              <Link href="/admin/audit-logs" className={buttonVariants({ variant: "outline" })}>
                Audit logs
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Settings state</CardTitle>
            <CardDescription>
              Platform configuration tables are not modeled yet, so this screen is
              informational instead of editable.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Editable root-platform settings will need a dedicated backend table or
            RPC surface before we add form controls here.
          </CardContent>
        </Card>
      </div>
    </>
  );
}
