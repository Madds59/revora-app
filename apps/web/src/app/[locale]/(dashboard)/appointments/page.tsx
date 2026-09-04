import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireMembership } from "@/lib/auth";
import { getLocale, getTranslations } from "next-intl/server";
import { formatDateTime } from "@/lib/formatters";
import { getAppointmentStatusLabel, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointments";
import { createClient } from "@/lib/supabase/server";
import type { Appointment } from "@/lib/database.types";

type Row = Pick<
  Appointment,
  "id" | "status" | "requested_start" | "requested_end" | "confirmed_start" | "created_at"
> & { customer: { full_name: string } | null };

export default async function AppointmentsPage() {
  const t = await getTranslations("dashboardAppointments");
  const tError = await getTranslations("error");
  const locale = await getLocale();
  const { business } = await requireMembership();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, status, requested_start, requested_end, confirmed_start, created_at, customer:customers(full_name)",
    )
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });
  if (error) console.error("AppointmentsPage failed to load", error);
  const appointments = (data ?? []) as unknown as Row[];
  const requestedCount = appointments.filter((a) => a.status === "requested").length;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={
          requestedCount > 0
            ? `${t("description")} · ${requestedCount} awaiting review`
            : t("description")
        }
      />
      <div className="p-6">
        {error ? (
          <p className="text-destructive text-sm">{tError("description")}</p>
        ) : appointments.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          <>
            <MobileDataList
              items={appointments}
              empty={null}
              getKey={(a) => a.id}
              renderItem={(a) => (
                <MobileDataCard
                  title={
                    <Link href={`/appointments/${a.id}`} className="hover:underline">
                      {a.customer?.full_name ?? t("fallback.none")}
                    </Link>
                  }
                  subtitle={formatDateTime(a.confirmed_start ?? a.requested_start, undefined, locale)}
                  meta={
                    <Badge variant={APPOINTMENT_STATUS_VARIANT[a.status]}>
                      {getAppointmentStatusLabel(a.status, locale)}
                    </Badge>
                  }
                />
              )}
            />

            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.customer")}</TableHead>
                    <TableHead>{t("table.window")}</TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/appointments/${a.id}`} className="font-medium hover:underline">
                          {a.customer?.full_name ?? t("fallback.none")}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {formatDateTime(a.confirmed_start ?? a.requested_start, undefined, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={APPOINTMENT_STATUS_VARIANT[a.status]}>
                          {getAppointmentStatusLabel(a.status, locale)}
                        </Badge>
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
