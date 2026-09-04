import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { MobileDataCard, MobileDataList } from "@/components/mobile-data-list";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireCustomerPortal } from "@/lib/auth";
import { formatDateTime } from "@/lib/formatters";
import { getAppointmentStatusLabel, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointments";
import { createClient } from "@/lib/supabase/server";
import { getLocale } from "next-intl/server";
import type { Appointment } from "@/lib/database.types";

type Row = Pick<
  Appointment,
  "id" | "status" | "requested_start" | "confirmed_start"
> & { business: { name: string } | null };

export default async function PortalAppointmentsPage() {
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  const supabase = await createClient();
  const customerIds = accounts.map((account) => account.id);

  const { data, error } = await supabase
    .from("appointments")
    .select("id, status, requested_start, confirmed_start, business:businesses(name)")
    .in("customer_id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false });
  if (error) console.error("PortalAppointmentsPage failed to load", error);
  const appointments = (data ?? []) as unknown as Row[];

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Request a service slot and track your upcoming appointments."
        action={
          <Link href="/portal/appointments/new" className={buttonVariants()}>
            Request appointment
          </Link>
        }
      />
      <div className="p-6">
        {appointments.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground p-10 text-center text-sm">
              No appointments yet.
            </CardContent>
          </Card>
        ) : (
          <>
            <MobileDataList
              items={appointments}
              empty={null}
              getKey={(a) => a.id}
              renderItem={(a) => (
                <MobileDataCard
                  title={
                    <Link href={`/portal/appointments/${a.id}`} className="hover:underline">
                      {a.business?.name ?? "Workshop"}
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
                    <TableHead>Workshop</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/portal/appointments/${a.id}`} className="font-medium hover:underline">
                          {a.business?.name ?? "Workshop"}
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
