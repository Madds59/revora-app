import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMembership } from "@/lib/auth";
import { canManageAppointments } from "@/lib/permissions";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/formatters";
import { getAppointmentStatusLabel, APPOINTMENT_STATUS_VARIANT } from "@/lib/appointments";
import type { Appointment } from "@/lib/database.types";

import {
  CancelAppointmentButton,
  ConfirmAppointmentForm,
  ConvertToQuotationButton,
  DeclineAppointmentForm,
} from "../appointment-controls";

type AppointmentWithRelations = Appointment & {
  customer: { full_name: string; phone: string | null } | null;
  vehicle: { make: string | null; model: string | null; plate_number: string | null } | null;
  branch: { name: string } | null;
};

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { member, business } = await requireMembership();
  const canManage = canManageAppointments(member.role);
  const locale = await getLocale();
  const supabase = await createClient();

  const { data } = await supabase
    .from("appointments")
    .select(
      "*, customer:customers(full_name, phone), vehicle:vehicles(make, model, plate_number), branch:branches(name)",
    )
    .eq("business_id", business.id)
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
            {appointment.customer?.full_name ?? "Appointment"}
            <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]}>
              {getAppointmentStatusLabel(appointment.status, locale)}
            </Badge>
          </span>
        }
        description={[vehicleLabel, appointment.branch?.name].filter(Boolean).join(" · ")}
        action={
          <Link href={`/${locale}/appointments`} className={buttonVariants({ variant: "outline" })}>
            Back to appointments
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
              <span className="text-muted-foreground">Requested window: </span>
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
            {appointment.customer?.phone && (
              <div>
                <span className="text-muted-foreground">Phone: </span>
                {appointment.customer.phone}
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
                <span className="text-muted-foreground">Decline reason: </span>
                {appointment.decline_reason}
              </div>
            )}
          </CardContent>
        </Card>

        {canManage && appointment.status === "requested" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Confirm this appointment</CardTitle>
              </CardHeader>
              <CardContent>
                <ConfirmAppointmentForm
                  id={appointment.id}
                  suggestedStart={appointment.requested_start}
                  suggestedEnd={appointment.requested_end}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Decline this appointment</CardTitle>
              </CardHeader>
              <CardContent>
                <DeclineAppointmentForm id={appointment.id} />
              </CardContent>
            </Card>
          </>
        )}

        {canManage && appointment.status === "confirmed" && (
          <Card>
            <CardHeader>
              <CardTitle>Ready for the appointment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <ConvertToQuotationButton id={appointment.id} />
              <CancelAppointmentButton id={appointment.id} />
            </CardContent>
          </Card>
        )}

        {canManage && appointment.status === "requested" && (
          <CancelAppointmentButton id={appointment.id} />
        )}

        {appointment.quotation_id && (
          <Card>
            <CardContent className="pt-6">
              <Link href={`/${locale}/quotations/${appointment.quotation_id}`} className="underline text-sm">
                View the quotation created from this appointment
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
