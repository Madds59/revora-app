import { getTranslations } from "next-intl/server";
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

import { PromoteAdminForm, RevokeAdminButton } from "./promote-form";
import type { AdminSuperAdminRow } from "@/lib/admin-views";

export default async function AdminsPage() {
  const t = await getTranslations("adminAdmins");
  const me = await requireSuperAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_super_admins");
  if (error) console.error("AdminsPage failed to load", error);
  const admins = (data ?? []) as unknown as AdminSuperAdminRow[];

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("currentTitle", { count: admins.length })}</CardTitle>
            <CardDescription>{t("currentDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {error ? (
              <p role="alert" className="text-destructive text-sm">{t("loadError")}</p>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.email")}</TableHead>
                      <TableHead>{t("table.name")}</TableHead>
                      <TableHead>{t("table.since")}</TableHead>
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
            <CardTitle>{t("addTitle")}</CardTitle>
            <CardDescription>{t("addDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <PromoteAdminForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
