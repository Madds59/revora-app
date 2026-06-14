/**
 * Hand-authored subset of the Revora Supabase schema for the foundation slice
 * (profiles, businesses, business_members, branches, services, customers, vehicles).
 *
 * Regenerate the full, authoritative version once the database is running:
 *   supabase gen types typescript --local > src/lib/database.types.ts
 * (or `--project-id <ref>` against a hosted project).
 *
 * Source of truth: ~/Documents/Revora/supabase/migrations/0001_core_schema.sql
 */

export type MemberRole =
  | "super_admin"
  | "business_owner"
  | "manager"
  | "employee"
  | "customer";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "revised"
  | "approved"
  | "declined"
  | "expired"
  | "cancelled";

export type ComplaintStatus =
  | "open"
  | "assigned"
  | "awaiting_customer"
  | "investigating"
  | "escalated"
  | "resolved"
  | "closed";

export type ComplaintSeverity = "low" | "medium" | "high" | "critical";
export type JobStatus =
  | "pending"
  | "approved"
  | "in_progress"
  | "waiting_parts"
  | "delayed"
  | "completed"
  | "cancelled";
export type NotificationChannel =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "email"
  | "sms"
  | "push";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete";

export type ItemKind = "service" | "labor" | "product" | "part";

export type ProductCategory =
  | "oem"
  | "genuine"
  | "aftermarket"
  | "refurbished"
  | "used"
  | "custom";

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "oem",
  "genuine",
  "aftermarket",
  "refurbished",
  "used",
  "custom",
];

export const ITEM_KINDS: ItemKind[] = ["service", "labor", "product", "part"];

export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  "open",
  "assigned",
  "awaiting_customer",
  "investigating",
  "escalated",
  "resolved",
  "closed",
];

export const COMPLAINT_SEVERITIES: ComplaintSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  preferred_language: string;
  timezone: string;
} & Timestamps;

export type Business = {
  id: string;
  name: string;
  legal_name: string | null;
  tagline: string | null;
  country: string;
  default_language: string;
  supported_languages: string[];
  communication_preferences: Record<string, unknown>;
  branding: Record<string, unknown>;
  stripe_customer_id: string | null;
  created_by: string | null;
  deleted_at: string | null;
} & Timestamps;

export type BusinessMember = {
  id: string;
  business_id: string;
  user_id: string;
  role: MemberRole;
  branch_ids: string[];
  is_active: boolean;
  invited_by: string | null;
} & Timestamps;

export type Branch = {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown>;
  working_hours: Record<string, unknown>;
  is_active: boolean;
} & Timestamps;

export type Service = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  default_price: number | null;
  default_tax_rate: number;
  is_active: boolean;
} & Timestamps;

export type Customer = {
  id: string;
  business_id: string;
  app_user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown>;
  preferred_language: string;
  marketing_consent: boolean;
  metadata: Record<string, unknown>;
  created_by: string | null;
  deleted_at: string | null;
} & Timestamps;

export type Vehicle = {
  id: string;
  business_id: string;
  customer_id: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate_number: string | null;
  vin: string | null;
  color: string | null;
  metadata: Record<string, unknown>;
} & Timestamps;

export type TermsVersion = {
  id: string;
  business_id: string;
  title: string;
  language: string;
  body: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type Quotation = {
  id: string;
  business_id: string;
  branch_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  project_id: string | null;
  terms_version_id: string | null;
  quote_number: string;
  status: QuoteStatus;
  current_version: number;
  language: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  expected_completion_date: string | null;
  warranty_terms: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  customer_rejection_note: string | null;
  customer_rejected_at: string | null;
  sent_at: string | null;
  expires_at: string | null;
  created_by: string | null;
} & Timestamps;

export type QuotationItem = {
  id: string;
  business_id: string;
  quotation_id: string;
  product_id: string | null;
  kind: ItemKind;
  product_category: ProductCategory | null;
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_amount: number;
  total: number;
  time_estimate_minutes: number | null;
  transparency: Record<string, unknown>;
  position: number;
} & Timestamps;

export type Approval = {
  id: string;
  business_id: string;
  quotation_id: string;
  customer_id: string;
  quotation_version: number;
  terms_version_id: string | null;
  language: string;
  acknowledgement_text: string;
  signature_asset_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_data: Record<string, unknown>;
  approved_at: string;
  created_at: string;
};

export type Complaint = {
  id: string;
  business_id: string;
  customer_id: string;
  quotation_id: string | null;
  job_id: string | null;
  status: ComplaintStatus;
  severity: ComplaintSeverity;
  subject: string;
  description: string;
  assigned_to: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  created_by: string | null;
} & Timestamps;

export type ComplaintMessage = {
  id: string;
  business_id: string;
  complaint_id: string;
  parent_message_id: string | null;
  sender_id: string | null;
  sender_role: MemberRole;
  body: string;
  internal_only: boolean;
  created_at: string;
};

export type Job = {
  id: string;
  business_id: string;
  quotation_id: string | null;
  customer_id: string;
  branch_id: string | null;
  status: JobStatus;
  title: string;
  description: string | null;
  expected_completion_at: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
} & Timestamps;

export type JobTask = {
  id: string;
  business_id: string;
  job_id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  assigned_to: string | null;
  due_at: string | null;
  completed_at: string | null;
} & Timestamps;

export type JobUpdate = {
  id: string;
  business_id: string;
  job_id: string;
  status: JobStatus | null;
  message: string;
  visible_to_customer: boolean;
  created_by: string | null;
  created_at: string;
};

export type Document = {
  id: string;
  business_id: string;
  customer_id: string | null;
  quotation_id: string | null;
  complaint_id: string | null;
  job_id: string | null;
  media_asset_id: string;
  document_type: string;
  title: string;
  created_by: string | null;
  created_at: string;
};

export type MediaAsset = {
  id: string;
  business_id: string;
  bucket: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  purpose: string;
  visibility: string;
  uploaded_by: string | null;
  created_at: string;
};

export type ComplaintEvidence = {
  id: string;
  business_id: string;
  complaint_id: string;
  media_asset_id: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  business_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan_key: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  entitlements: Record<string, unknown>;
} & Timestamps;

export type SubscriptionItem = {
  id: string;
  subscription_id: string;
  stripe_subscription_item_id: string | null;
  stripe_price_id: string;
  product_key: string;
  quantity: number;
  created_at: string;
};

export type BillingInvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "uncollectible"
  | "void"
  | "deleted";

export type BillingInvoice = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  invoice_number: string | null;
  status: BillingInvoiceStatus;
  currency: string;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  paid_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingInvoiceItem = {
  id: string;
  stripe_invoice_line_item_id: string | null;
  invoice_id: string;
  business_id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  amount: number;
  currency: string;
  period_start: string | null;
  period_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type BillingPaymentEvent = {
  id: string;
  business_id: string;
  invoice_id: string | null;
  subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  event_type: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  provider_event_id: string | null;
  raw_payload: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type BillingPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  monthly_amount: number | null;
  yearly_amount: number | null;
  currency: string;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type BillingPlanFeature = {
  id: string;
  plan_id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  included: boolean;
  limit_value: number | null;
  limit_unit: string | null;
  sort_order: number;
  created_at: string;
};

export type BillingPlanCatalogRow = BillingPlan & {
  features: BillingPlanFeature[];
};

export type BillingInvoiceSummaryRow = BillingInvoice & {
  item_count: number;
  subscription_plan_key: string | null;
  subscription_status: SubscriptionStatus | null;
};

export type BillingRevenueSummary = {
  total_paid_revenue: number;
  paid_invoices_count: number;
  open_invoices_count: number;
  overdue_or_due_invoices_count: number;
  open_invoice_amount: number;
  amount_due: number;
  average_invoice_value: number;
  currency: string;
  period_start: string;
  period_end: string;
};

export type BillingRevenueTrendRow = {
  bucket_start: string;
  revenue: number;
  invoice_count: number;
  currency: string;
};

export type PaginatedListResult<Row> = {
  rows: Row[];
  total_count: number;
};

export type NotificationEvent = {
  id: string;
  business_id: string;
  customer_id: string | null;
  channel: NotificationChannel;
  template_key: string;
  payload: Record<string, unknown>;
  status: string;
  provider_message_id: string | null;
  scheduled_for: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  read_at: string | null;
  read_by: string | null;
  created_at: string;
};

export type AuditEvent = {
  id: number;
  business_id: string | null;
  actor_id: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type InvitationStatus = "pending" | "accepted" | "revoked";

export type BusinessInvitation = {
  id: string;
  business_id: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  invited_by: string | null;
  accepted_by: string | null;
  created_at: string;
  accepted_at: string | null;
};

export type PlatformAdmin = {
  user_id: string;
  created_at: string;
};

/** Shape returned by the admin_platform_metrics RPC. */
export type PlatformMetrics = {
  businesses: number;
  users: number;
  customers: number;
  quotations: number;
  approved_quotes: number;
  complaints: number;
  open_complaints: number;
  super_admins: number;
};

/** Row shape from admin_list_businesses. */
export type AdminBusinessRow = {
  id: string;
  name: string;
  created_at: string;
  owner_email: string | null;
  member_count: number;
  customer_count: number;
  quote_count: number;
  complaint_count: number;
};

export type AdminBusinessFilteredRow = AdminBusinessRow & {
  status: SubscriptionStatus | null;
  plan_key: string | null;
  current_period_end: string | null;
  industry: string | null;
};

/** Row shape from admin_list_super_admins. */
export type AdminSuperAdminRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
};

export type AdminUserRow = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_super_admin: boolean;
  business_memberships: number;
  linked_customers: number;
};

export type AdminUserFilteredRow = AdminUserRow & {
  role_type: "super_admin" | "business_owner" | "manager" | "employee" | "customer" | "user";
  status: "active" | "inactive";
};

export type AdminSubscriptionRow = {
  id: string;
  business_id: string;
  business_name: string;
  status: SubscriptionStatus;
  plan_key: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
};

export type AdminSubscriptionFilteredRow = AdminSubscriptionRow & {
  billing_interval: "monthly" | "yearly" | "unknown";
};

export type AdminNotificationRow = {
  id: string;
  business_id: string;
  business_name: string;
  customer_email: string | null;
  channel: NotificationChannel;
  template_key: string;
  status: string;
  created_at: string;
  scheduled_for: string | null;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  read_at: string | null;
};

export type AdminNotificationFilteredRow = AdminNotificationRow & {
  scheduled_for: string | null;
  notification_type: "quote" | "complaint" | "job" | "billing" | "system";
};

export type AdminAuditLogRow = {
  id: number;
  business_id: string | null;
  business_name: string | null;
  actor_email: string | null;
  actor_name: string | null;
  table_name: string;
  record_id: string | null;
  action: string;
  created_at: string;
};

export type AdminAuditLogFilteredRow = AdminAuditLogRow;

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        Profile,
        Pick<Profile, "id"> & Partial<Profile>,
        Partial<Profile>
      >;
      businesses: Table<
        Business,
        Pick<Business, "name"> & Partial<Business>,
        Partial<Business>
      >;
      business_members: Table<
        BusinessMember,
        Pick<BusinessMember, "business_id" | "user_id" | "role"> &
          Partial<BusinessMember>,
        Partial<BusinessMember>
      >;
      branches: Table<
        Branch,
        Pick<Branch, "business_id" | "name"> & Partial<Branch>,
        Partial<Branch>
      >;
      services: Table<
        Service,
        Pick<Service, "business_id" | "name"> & Partial<Service>,
        Partial<Service>
      >;
      customers: Table<
        Customer,
        Pick<Customer, "business_id" | "full_name"> & Partial<Customer>,
        Partial<Customer>
      >;
      vehicles: Table<
        Vehicle,
        Pick<Vehicle, "business_id" | "customer_id"> & Partial<Vehicle>,
        Partial<Vehicle>
      >;
      terms_versions: Table<
        TermsVersion,
        Pick<TermsVersion, "business_id" | "title" | "body" | "version"> &
          Partial<TermsVersion>,
        Partial<TermsVersion>
      >;
      quotations: Table<
        Quotation,
        Pick<Quotation, "business_id" | "customer_id" | "quote_number"> &
          Partial<Quotation>,
        Partial<Quotation>
      >;
      quotation_items: Table<
        QuotationItem,
        Pick<
          QuotationItem,
          "business_id" | "quotation_id" | "kind" | "name"
        > &
          Partial<QuotationItem>,
        Partial<QuotationItem>
      >;
      approvals: Table<
        Approval,
        Pick<
          Approval,
          | "business_id"
          | "quotation_id"
          | "customer_id"
          | "quotation_version"
          | "language"
          | "acknowledgement_text"
        > &
          Partial<Approval>,
        Partial<Approval>
      >;
      jobs: Table<
        Job,
        Pick<Job, "business_id" | "customer_id" | "title"> & Partial<Job>,
        Partial<Job>
      >;
      job_tasks: Table<
        JobTask,
        Pick<JobTask, "business_id" | "job_id" | "title"> & Partial<JobTask>,
        Partial<JobTask>
      >;
      job_updates: Table<
        JobUpdate,
        Pick<JobUpdate, "business_id" | "job_id" | "message"> & Partial<JobUpdate>,
        Partial<JobUpdate>
      >;
      complaints: Table<
        Complaint,
        Pick<Complaint, "business_id" | "customer_id" | "subject" | "description"> &
          Partial<Complaint>,
        Partial<Complaint>
      >;
      media_assets: Table<
        MediaAsset,
        Pick<
          MediaAsset,
          | "business_id"
          | "bucket"
          | "object_path"
          | "file_name"
          | "mime_type"
          | "size_bytes"
          | "purpose"
        > &
          Partial<MediaAsset>,
        Partial<MediaAsset>
      >;
      complaint_evidence: Table<
        ComplaintEvidence,
        Pick<ComplaintEvidence, "business_id" | "complaint_id"> &
          Partial<ComplaintEvidence>,
        Partial<ComplaintEvidence>
      >;
      documents: Table<
        Document,
        Pick<Document, "business_id" | "media_asset_id" | "document_type" | "title"> &
          Partial<Document>,
        Partial<Document>
      >;
      complaint_messages: Table<
        ComplaintMessage,
        Pick<
          ComplaintMessage,
          "business_id" | "complaint_id" | "sender_role" | "body"
        > &
          Partial<ComplaintMessage>,
        Partial<ComplaintMessage>
      >;
      notification_events: Table<
        NotificationEvent,
        Pick<NotificationEvent, "business_id" | "channel" | "template_key"> &
          Partial<NotificationEvent>,
        Partial<NotificationEvent>
      >;
      subscriptions: Table<
        Subscription,
        Pick<Subscription, "business_id" | "stripe_subscription_id" | "status" | "plan_key"> &
          Partial<Subscription>,
        Partial<Subscription>
      >;
      subscription_items: Table<
        SubscriptionItem,
        Pick<
          SubscriptionItem,
          "subscription_id" | "stripe_subscription_item_id" | "stripe_price_id" | "product_key"
        > &
          Partial<SubscriptionItem>,
        Partial<SubscriptionItem>
      >;
      billing_invoices: Table<
        BillingInvoice,
        Pick<BillingInvoice, "business_id" | "status" | "currency"> &
          Partial<BillingInvoice>,
        Partial<BillingInvoice>
      >;
      billing_invoice_items: Table<
        BillingInvoiceItem,
        Pick<
          BillingInvoiceItem,
          "invoice_id" | "business_id" | "description" | "stripe_invoice_line_item_id"
        > &
          Partial<BillingInvoiceItem>,
        Partial<BillingInvoiceItem>
      >;
      billing_payment_events: Table<
        BillingPaymentEvent,
        Pick<BillingPaymentEvent, "business_id" | "event_type" | "status"> &
          Partial<BillingPaymentEvent>,
        Partial<BillingPaymentEvent>
      >;
      billing_plans: Table<
        BillingPlan,
        Pick<BillingPlan, "slug" | "name"> & Partial<BillingPlan>,
        Partial<BillingPlan>
      >;
      billing_plan_features: Table<
        BillingPlanFeature,
        Pick<BillingPlanFeature, "plan_id" | "feature_key" | "feature_name"> &
          Partial<BillingPlanFeature>,
        Partial<BillingPlanFeature>
      >;
      audit_events: Table<
        AuditEvent,
        Pick<AuditEvent, "table_name" | "action"> & Partial<AuditEvent>,
        Partial<AuditEvent>
      >;
      business_invitations: Table<
        BusinessInvitation,
        Pick<BusinessInvitation, "business_id" | "email" | "role"> &
          Partial<BusinessInvitation>,
        Partial<BusinessInvitation>
      >;
      platform_admins: Table<
        PlatformAdmin,
        Pick<PlatformAdmin, "user_id"> & Partial<PlatformAdmin>,
        Partial<PlatformAdmin>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_business: {
        Args: { business_name: string; owner_full_name?: string | null };
        Returns: string;
      };
      create_quotation_draft: {
        Args: {
          target_business_id: string;
          target_customer_id: string;
          target_created_by?: string | null;
          target_currency?: string | null;
          target_vehicle_id?: string | null;
        };
        Returns: string;
      };
      customer_reject_quote: {
        Args: {
          rejection_note?: string | null;
          target_customer_id: string;
          target_quotation_id: string;
        };
        Returns: undefined;
      };
      claim_customer_records: {
        Args: Record<string, never>;
        Returns: number;
      };
      claim_business_invitations: {
        Args: Record<string, never>;
        Returns: number;
      };
      record_complaint_evidence: {
        Args: {
          p_complaint_id: string;
          p_object_path: string;
          p_file_name: string;
          p_mime_type: string;
          p_size_bytes: number;
          p_description?: string | null;
        };
        Returns: string;
      };
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      admin_platform_metrics: {
        Args: Record<string, never>;
        Returns: PlatformMetrics;
      };
      admin_list_users: {
        Args: Record<string, never>;
        Returns: AdminUserRow[];
      };
      admin_list_businesses: {
        Args: Record<string, never>;
        Returns: AdminBusinessRow[];
      };
      admin_list_super_admins: {
        Args: Record<string, never>;
        Returns: AdminSuperAdminRow[];
      };
      admin_list_subscriptions: {
        Args: Record<string, never>;
        Returns: AdminSubscriptionRow[];
      };
      admin_list_notifications: {
        Args: Record<string, never>;
        Returns: AdminNotificationRow[];
      };
      admin_list_businesses_filtered: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_plan?: string | null;
          p_industry?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<AdminBusinessFilteredRow>;
      };
      admin_list_users_filtered: {
        Args: {
          p_search?: string | null;
          p_role?: string | null;
          p_status?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<AdminUserFilteredRow>;
      };
      admin_list_subscriptions_filtered: {
        Args: {
          p_search?: string | null;
          p_plan?: string | null;
          p_status?: string | null;
          p_interval?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<AdminSubscriptionFilteredRow>;
      };
      admin_list_audit_logs_filtered: {
        Args: {
          p_search?: string | null;
          p_action?: string | null;
          p_entity?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<AdminAuditLogFilteredRow>;
      };
      admin_list_notifications_filtered: {
        Args: {
          p_search?: string | null;
          p_type?: string | null;
          p_read_state?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<AdminNotificationFilteredRow>;
      };
      admin_mark_notification_read: {
        Args: { notification_id: string };
        Returns: void;
      };
      mark_business_notification_read: {
        Args: { target_notification_id: string };
        Returns: void;
      };
      mark_business_notifications_read: {
        Args: { target_business_id: string };
        Returns: number;
      };
      admin_list_audit_logs: {
        Args: Record<string, never>;
        Returns: AdminAuditLogRow[];
      };
      admin_set_super_admin: {
        Args: { target_email: string; make_admin: boolean };
        Returns: undefined;
      };
      list_active_billing_plans: {
        Args: Record<string, never>;
        Returns: BillingPlanCatalogRow[];
      };
      list_business_billing_invoices: {
        Args: {
          p_business_id: string;
          p_limit?: number | null;
          p_offset?: number | null;
        };
        Returns: PaginatedListResult<BillingInvoiceSummaryRow>;
      };
      get_business_revenue_summary: {
        Args: {
          p_business_id: string;
          p_period?: string | null;
        };
        Returns: BillingRevenueSummary;
      };
      get_business_revenue_trend: {
        Args: {
          p_business_id: string;
          p_period?: string | null;
        };
        Returns: BillingRevenueTrendRow[];
      };
    };
    Enums: {
      member_role: MemberRole;
      complaint_status: ComplaintStatus;
      complaint_severity: ComplaintSeverity;
      job_status: JobStatus;
      notification_channel: NotificationChannel;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
