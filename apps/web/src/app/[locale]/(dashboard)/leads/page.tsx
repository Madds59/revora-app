import { getLocale, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireMembership } from "@/lib/auth";
import { requireFeature } from "@/lib/features/guard";
import { canManageLeads } from "@/lib/permissions";
import { OPEN_LEAD_STATUSES } from "@/lib/leads.js";
import { createClient } from "@/lib/supabase/server";
import { unwrapCount, unwrapRows } from "@/lib/supabase/unwrap.js";
import type { ChannelIdentity, Customer, Lead, Profile } from "@/lib/database.types";

import { LeadsBrowser, type LeadListRow } from "./leads-browser";

export async function generateMetadata() {
  const t = await getTranslations("dashboardLeads");
  return { title: t("title"), description: t("description") };
}

type IdentityLookup = Pick<
  ChannelIdentity,
  "id" | "display_name" | "external_handle" | "external_id"
>;
type CustomerLookup = Pick<Customer, "id" | "full_name">;
type ProfileLookup = Pick<Profile, "id" | "full_name">;

export default async function LeadsPage() {
  await requireFeature("inboundCapture");
  const t = await getTranslations("dashboardLeads");
  const locale = await getLocale();
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

  // Flat selects and separate lookups rather than PostgREST embeds, matching
  // the complaints page. 0048 gives every parent exactly one foreign-key path,
  // so an embed would resolve -- but a flat select cannot acquire a PGRST201
  // ambiguity later if another reference is ever added, and PGRST201 surfaces
  // as a false empty state rather than an error.
  const [leadsResult, openCountResult, convertedCountResult] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, business_id, channel, channel_identity_id, customer_id, subject, summary, status, urgency, safety_flagged, assigned_to, source_campaign_id, source_ad_id, source_form_id, created_at, first_response_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .in("status", OPEN_LEAD_STATUSES),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .eq("status", "converted"),
  ]);

  const leadRows = (unwrapRows(leadsResult, "leads.list") ?? []) as Lead[];
  const openCount = unwrapCount(openCountResult, "leads.openCount");
  const convertedCount = unwrapCount(convertedCountResult, "leads.convertedCount");

  const identityIds = [
    ...new Set(leadRows.flatMap((row) => (row.channel_identity_id ? [row.channel_identity_id] : []))),
  ];
  const customerIds = [
    ...new Set(leadRows.flatMap((row) => (row.customer_id ? [row.customer_id] : []))),
  ];
  const assigneeIds = [
    ...new Set(leadRows.flatMap((row) => (row.assigned_to ? [row.assigned_to] : []))),
  ];

  const [identitiesResult, customersResult, profilesResult] = await Promise.all([
    identityIds.length
      ? supabase
          .from("channel_identities")
          .select("id, display_name, external_handle, external_id")
          .in("id", identityIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabase.from("customers").select("id, full_name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
    assigneeIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const identities = (unwrapRows(identitiesResult, "leads.identities") ?? []) as IdentityLookup[];
  const customers = (unwrapRows(customersResult, "leads.customers") ?? []) as CustomerLookup[];
  const profiles = (unwrapRows(profilesResult, "leads.assignees") ?? []) as ProfileLookup[];

  const identityById = new Map(identities.map((row) => [row.id, row]));
  const customerById = new Map(customers.map((row) => [row.id, row.full_name]));
  const profileById = new Map(profiles.map((row) => [row.id, row.full_name]));

  const rows: LeadListRow[] = leadRows.map((lead) => {
    const identity = lead.channel_identity_id
      ? identityById.get(lead.channel_identity_id)
      : undefined;
    return {
      id: lead.id,
      channel: lead.channel,
      subject: lead.subject,
      summary: lead.summary,
      status: lead.status,
      urgency: lead.urgency,
      safety_flagged: lead.safety_flagged,
      created_at: lead.created_at,
      first_response_at: lead.first_response_at,
      has_attribution: Boolean(
        lead.source_campaign_id || lead.source_ad_id || lead.source_form_id,
      ),
      customer_name: lead.customer_id ? (customerById.get(lead.customer_id) ?? null) : null,
      identity_display_name: identity?.display_name ?? null,
      identity_handle: identity?.external_handle ?? null,
      assignee_name: lead.assigned_to ? (profileById.get(lead.assigned_to) ?? null) : null,
    };
  });

  const unassignedCount = rows.filter(
    (row) => !row.assignee_name && (OPEN_LEAD_STATUSES as string[]).includes(row.status),
  ).length;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex flex-col gap-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.open")}</CardDescription>
              <CardTitle className="text-3xl">{openCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.unassigned")}</CardDescription>
              <CardTitle className="text-3xl">{unassignedCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("stats.converted")}</CardDescription>
              <CardTitle className="text-3xl">{convertedCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <LeadsBrowser leads={rows} locale={locale === "ar" ? "ar" : "en"} />
      </div>
    </>
  );
}
