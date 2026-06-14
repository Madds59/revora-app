import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { formatDate } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/database.types";
import { getTranslations } from "next-intl/server";

export default async function CustomersPage() {
  const t = await getTranslations("dashboardCustomers");
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data: customers, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, created_at")
    .eq("business_id", business.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Link href="/customers/new" className={buttonVariants()}>
            {t("actions.addCustomer")}
          </Link>
        }
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{error.message}</p>
        ) : !customers || customers.length === 0 ? (
          <EmptyState
            title={t("empty.title")}
            description={t("empty.description")}
            action={
              <Link href="/customers/new" className={buttonVariants({ variant: "secondary" })}>
                {t("empty.action")}
              </Link>
            }
          />
        ) : (
          <>
            <MobileDataList
              items={customers as Pick<
                Customer,
                "id" | "full_name" | "phone" | "email" | "created_at"
              >[]}
              empty={null}
              getKey={(customer) => customer.id}
              renderItem={(customer) => (
                <MobileDataCard
                  title={
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {customer.full_name}
                    </Link>
                  }
                  subtitle={customer.email ?? t("fallback.noEmail")}
                  meta={
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{customer.phone ?? t("fallback.noPhone")}</span>
                      <span>{formatDate(customer.created_at)}</span>
                    </div>
                  }
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.name")}</TableHead>
                    <TableHead>{t("table.phone")}</TableHead>
                    <TableHead>{t("table.email")}</TableHead>
                    <TableHead>{t("table.created")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(customers as Pick<
                    Customer,
                    "id" | "full_name" | "phone" | "email" | "created_at"
                  >[]).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link
                          href={`/customers/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.full_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.phone ?? t("fallback.none")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email ?? t("fallback.none")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(c.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
