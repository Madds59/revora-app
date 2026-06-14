import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AdminSuperAdminRow } from "@/lib/database.types";

import { PromoteAdminForm, RevokeAdminButton } from "./promote-form";

export default async function AdminsPage() {
  const me = await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_super_admins");
  const admins = (data ?? []) as AdminSuperAdminRow[];

  return (
    <>
      <PageHeader
        title="Super admins"
        description="Platform administrators with cross-tenant access."
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Current super admins ({admins.length})</CardTitle>
            <CardDescription>
              These accounts can see and manage every tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p className="text-destructive text-sm">{error.message}</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Since</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins.map((a) => (
                      <TableRow key={a.user_id}>
                        <TableCell className="font-medium">
                          {a.email ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {a.full_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(a.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-end">
                          {a.user_id !== me.id && a.email && (
                            <RevokeAdminButton email={a.email} />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a super admin</CardTitle>
            <CardDescription>
              Grant platform access to an existing user by email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PromoteAdminForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
