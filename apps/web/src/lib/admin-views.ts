export interface PaginatedListResult<T> {
  rows: T[];
  total_count: number;
}

export interface PlatformMetrics {
  businesses: number;
  customers: number;
  quotations: number;
  complaints: number;
  users: number;
  approved_quotes?: number;
  open_complaints?: number;
  super_admins?: number;
}

export interface AdminBusinessRow {
  id: string;
  name: string;
  owner_email: string | null;
  member_count: number;
  customer_count: number;
  quote_count: number;
  complaint_count: number;
  created_at: string;
}

export type AdminBusinessFilteredRow = AdminBusinessRow;

export interface AdminSubscriptionRow {
  id: string;
  business_name: string;
  plan_key: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export type AdminSubscriptionFilteredRow = AdminSubscriptionRow;

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_super_admin: boolean;
  business_memberships: number;
  linked_customers: number;
  created_at: string;
}

export type AdminUserFilteredRow = AdminUserRow;

export interface AdminNotificationRow {
  id: string;
  template_key: string;
  business_name: string | null;
  customer_email: string | null;
  channel: string | null;
  read_at: string | null;
  status: string;
  created_at: string;
}

export type AdminNotificationFilteredRow = AdminNotificationRow;

export interface AdminAuditLogRow {
  id: string;
  actor_email: string | null;
  actor_name: string | null;
  action: string;
  table_name: string;
  business_name: string | null;
  created_at: string;
}

export type AdminAuditLogFilteredRow = AdminAuditLogRow;

export interface AdminSuperAdminRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
}
