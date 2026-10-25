import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMembership } from "@/lib/auth";
import { requireFeature } from "@/lib/features/guard";
import { formatDate } from "@/lib/formatters";
import {
  getLeadChannelLabel,
  getLeadContactLabel,
  getLeadStatusLabel,
  getLeadUrgencyLabel,
  LEAD_STATUS_VARIANT,
  LEAD_URGENCY_VARIANT,
} from "@/lib/leads.js";
import type { LeadStatus, LeadUrgency } from "@/lib/leads-types";
import { canManageLeads } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { unwrapRow, unwrapRows } from "@/lib/supabase/unwrap.js";
import type {
  BusinessMember,
  ChannelIdentity,
  Customer,
  Lead,
  LeadMessage,
  Profile,
} from "@/lib/database.types";

import { convertLead, updateLead } from "../actions";
import { LeadConvertForm } from "../lead-convert-form";
import { LeadTriageForm } from "../lead-triage-form";

export async function generateMetadata() {
  const t = await getTranslations("dashboardLeads");
  return { title: t("title") };
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireFeature("inboundCapture");
  const { id } = await params;
  const t = await getTranslations("dashboardLeads");
  const locale = (await getLocale()) === "ar" ? "ar" : "en";
  const { member, business } = await requireMembership();

  if (!canManageLeads(member.role)) {
    return (
      <>
        <PageHeader title={t("title")} description={t("accessRestrictedDescription")} />
        <div className="p-6">
          <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
            {t("accessRestricted")}
          </div>
        </div>
      </>
    );
  }

  const supabase = await createClient();
  const leadResult = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    // Scoped as well as RLS-protected: a lead from another tenant must read as
    // absent, not as a permission error that confirms the id exists.
    .eq("business_id", business.id)
    .maybeSingle();
  const lead = unwrapRow(leadResult, "leads.detail") as Lead | null;
  if (!lead) notFound();

  const [identityResult, customerResult, messagesResult, staffResult] = await Promise.all([
    lead.channel_identity_id
      ? supabase
          .from("channel_identities")
          .select("*")
          .eq("id", lead.channel_identity_id)
          .eq("business_id", business.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lead.customer_id
      ? supabase
          .from("customers")
          .select("id, full_name, phone, email")
          .eq("id", lead.customer_id)
          .eq("business_id", business.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("lead_messages")
      .select("id, direction, author_type, body, is_internal, created_at, author_user_id")
      .eq("lead_id", lead.id)
      .eq("business_id", business.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("business_members")
      .select("user_id, role")
      .eq("business_id", business.id)
      .eq("is_active", true),
  ]);

  const identity = unwrapRow(identityResult, "leads.identity") as ChannelIdentity | null;
  const customer = unwrapRow(customerResult, "leads.customer") as
    | Pick<Customer, "id" | "full_name" | "phone" | "email">
    | null;
  const messages = (unwrapRows(messagesResult, "leads.messages") ?? []) as LeadMessage[];
  const staff = (unwrapRows(staffResult, "leads.staff") ?? []) as Array<
    Pick<BusinessMember, "user_id" | "role">
  >;

  const staffIds = staff.map((row) => row.user_id).filter((value): value is string => !!value);
  const profilesResult = staffIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", staffIds)
    : { data: [], error: null };
  const profiles = (unwrapRows(profilesResult, "leads.staffProfiles") ?? []) as Array<
    Pick<Profile, "id" | "full_name">
  >;
  const assignees = profiles.map((row) => ({ id: row.id, name: row.full_name ?? row.id }));
  const assigneeNameById = new Map(assignees.map((person) => [person.id, person.name]));

  const contactLabel = getLeadContactLabel(
    {
      customer_name: customer?.full_name ?? null,
      identity_display_name: identity?.display_name ?? null,
      identity_handle: identity?.external_handle ?? null,
    },
    t("table.unassigned"),
  );

  const status = lead.status as LeadStatus;
  const urgency = lead.urgency as LeadUrgency;
  const hasAttribution = Boolean(
    lead.source_campaign_id || lead.source_ad_id || lead.source_form_id,
  );

  return (
    <>
      <PageHeader
        title={contactLabel}
        description={lead.subject ?? lead.summary ?? t("description")}
      />

      <div className="flex flex-col gap-6 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/leads"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("detail.backToQueue")}
          </Link>
          <Badge variant="outline">{getLeadChannelLabel(lead.channel, locale)}</Badge>
          <Badge variant={LEAD_STATUS_VARIANT[status] ?? "outline"}>
            {getLeadStatusLabel(status, locale)}
          </Badge>
          <Badge variant={LEAD_URGENCY_VARIANT[urgency] ?? "outline"}>
            {getLeadUrgencyLabel(urgency, locale)}
          </Badge>
          <span className="text-muted-foreground text-sm">
            {t("table.received")}: {formatDate(lead.created_at)}
          </span>
        </div>

        {lead.safety_flagged && (
          <div className="border-destructive/50 bg-destructive/5 flex items-start gap-3 rounded-lg border p-4">
            <ShieldAlert className="text-destructive mt-0.5 size-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium">{t("detail.safetyFlagged")}</div>
              <p className="text-muted-foreground text-sm">
                {t("detail.safetyFlaggedDescription")}
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.thread")}</CardTitle>
                <CardDescription>
                  {lead.first_response_at
                    ? `${t("table.received")}: ${formatDate(lead.created_at)}`
                    : t("description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {messages.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("detail.threadEmpty")}</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.direction === "inbound"
                          ? "bg-muted/50 rounded-lg border p-3"
                          : "rounded-lg border p-3"
                      }
                    >
                      <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-medium">
                          {message.direction === "inbound"
                            ? t("detail.inbound")
                            : (message.author_user_id
                                ? assigneeNameById.get(message.author_user_id)
                                : null) ?? t("detail.outbound")}
                        </span>
                        {message.author_type === "ai_agent" && (
                          <Badge variant="secondary">{t("detail.aiGenerated")}</Badge>
                        )}
                        {message.is_internal && (
                          <Badge variant="outline">{t("detail.internalNote")}</Badge>
                        )}
                        <span>{formatDate(message.created_at)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{message.body ?? "—"}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("manage.title")}</CardTitle>
                <CardDescription>{t("manage.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <LeadTriageForm
                  action={updateLead}
                  assignees={assignees}
                  currentAssignee={lead.assigned_to}
                  currentStatus={lead.status}
                  currentSummary={lead.summary}
                  currentUrgency={lead.urgency}
                  leadId={lead.id}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("convert.title")}</CardTitle>
                <CardDescription>{t("convert.description")}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {customer ? (
                  <>
                    <p className="text-muted-foreground text-sm">
                      {t("convert.alreadyLinked")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/customers/${customer.id}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        {t("convert.viewCustomer")}
                      </Link>
                      <Link
                        href="/quotations/new"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("convert.newQuote")}
                      </Link>
                      <Link
                        href="/appointments"
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {t("convert.bookAppointment")}
                      </Link>
                    </div>
                  </>
                ) : (
                  <LeadConvertForm
                    action={convertLead}
                    leadId={lead.id}
                    suggestedName={identity?.display_name ?? identity?.external_handle ?? null}
                    suggestedPhone={
                      // A WhatsApp, SMS or voice identity IS a phone number;
                      // an Instagram PSID is not, so it is not offered as one.
                      identity &&
                      (identity.channel === "whatsapp" ||
                        identity.channel === "sms" ||
                        identity.channel === "voice")
                        ? identity.external_id
                        : null
                    }
                    suggestedEmail={
                      identity && identity.channel === "email" ? identity.external_id : null
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.identity")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label={t("table.channel")} value={getLeadChannelLabel(lead.channel, locale)} />
                <Row label={t("detail.handle")} value={identity?.external_handle ?? "—"} />
                <Row
                  label={t("detail.firstSeen")}
                  value={identity ? formatDate(identity.first_seen_at) : "—"}
                />
                <Row
                  label={t("detail.lastSeen")}
                  value={identity ? formatDate(identity.last_seen_at) : "—"}
                />
                <Row
                  label={t("detail.linkedCustomer")}
                  value={customer?.full_name ?? t("detail.notLinked")}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("detail.attribution")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {hasAttribution ? (
                  <>
                    <Row label={t("detail.campaign")} value={lead.source_campaign_id ?? "—"} />
                    <Row label={t("detail.ad")} value={lead.source_ad_id ?? "—"} />
                    <Row label={t("detail.form")} value={lead.source_form_id ?? "—"} />
                  </>
                ) : (
                  <p className="text-muted-foreground">{t("detail.noAttribution")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-end font-medium break-all">{value}</span>
    </div>
  );
}
