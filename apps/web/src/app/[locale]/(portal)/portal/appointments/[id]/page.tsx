import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomerPortal } from "@/lib/auth";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";
import { getAppointmentStatusLabel, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointments";
import type { Appointment } from "@/lib/database.types";

import { CancelAppointmentButton } from "../cancel-appointment-button";

type AppointmentWithRelations = Appointment & {
  business: { name: string } | null;
  vehicle: { make: string | null; model: string | null; plate_number: string | null } | null;
};

export default async function PortalAppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const { accounts } = await requireCustomerPortal();
  const customerIds = accounts.map((account) => account.id);
  const supabase = await createClient();

  const { data } = await supabase
    .from("appointments")
    .select("*, business:businesses(name), vehicle:vehicles(make, model, plate_number)")
    .in("customer_id", customerIds.length > 0 ? customerIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const appointment = data as unknown as AppointmentWithRelations;

  const v = appointment.vehicle;
  const vehicleLabel = v
    ? [v.make, v.model].filter(Boolean).join(" ") + (v.plate_number ? ` · ${v.plate_number}` : "")
    : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {appointment.business?.name ?? "Appointment"}
            <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
              {getAppointmentStatusLabel(appointment.status, locale)}
            </Badge>
          </span>
        }
        description={vehicleLabel ?? undefined}
        action={
          <Link href={`/${locale}/portal/appointments`} className={buttonVariants({ variant: "outline" })}>
            Back
          </Link>
        }
      />
      <div className="flex flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Requested: </span>
              {formatDateTime(appointment.requested_start, undefined, locale)} –{" "}
              {formatDateTime(appointment.requested_end, undefined, locale)}
            </div>
            {appointment.confirmed_start && (
              <div>
                <span className="text-muted-foreground">Confirmed: </span>
                {formatDateTime(appointment.confirmed_start, undefined, locale)} –{" "}
                {formatDateTime(appointment.confirmed_end, undefined, locale)}
              </div>
            )}
            {appointment.notes && (
              <div>
                <span className="text-muted-foreground">Notes: </span>
                {appointment.notes}
              </div>
            )}
            {appointment.decline_reason && (
              <div>
                <span className="text-muted-foreground">The workshop declined: </span>
                {appointment.decline_reason}
              </div>
            )}
          </CardContent>
        </Card>

        {(appointment.status === "requested" || appointment.status === "confirmed") && (
          <CancelAppointmentButton id={appointment.id} />
        )}
      </div>
    </>
  );
}
