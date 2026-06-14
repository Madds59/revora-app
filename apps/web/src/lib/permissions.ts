import type { MemberRole } from "@/lib/database.types";

/**
 * Client/server role gates that mirror the Postgres RLS helper
 * `has_business_role(...)` in supabase/migrations/0002_rls_policies.sql.
 * RLS is the real enforcement layer; these checks drive UI gating and
 * fail-fast server-side guards so users get clean errors instead of RLS denials.
 */

export const ROLE_LABELS: Record<MemberRole, string> = {
  super_admin: "Super Admin",
  business_owner: "Owner",
  manager: "Manager",
  employee: "Service advisor",
  customer: "Customer",
};

export function hasRole(
  role: MemberRole | null | undefined,
  allowed: MemberRole[],
): boolean {
  return role != null && allowed.includes(role);
}

/** Billing, users, branches, services, terms, branding. */
export function canManageBusiness(role: MemberRole | null | undefined): boolean {
  return hasRole(role, ["business_owner"]);
}

/** Branches and services (owner + manager per RLS). */
export function canManageSettings(role: MemberRole | null | undefined): boolean {
  return hasRole(role, ["business_owner", "manager"]);
}

/** Customers and vehicles (owner + manager + employee per RLS). */
export function canManageCustomers(
  role: MemberRole | null | undefined,
): boolean {
  return hasRole(role, ["business_owner", "manager", "employee"]);
}

/** Quotations and their items (owner + manager per RLS). */
export function canManageQuotes(role: MemberRole | null | undefined): boolean {
  return hasRole(role, ["business_owner", "manager"]);
}

/** Jobs, tasks, and updates (owner + manager + employee per RLS jobs_manage_staff). */
export function canManageJobs(role: MemberRole | null | undefined): boolean {
  return hasRole(role, ["business_owner", "manager", "employee"]);
}

/** Complaints can be handled by all active staff roles per RLS. */
export function canManageComplaints(
  role: MemberRole | null | undefined,
): boolean {
  return hasRole(role, ["business_owner", "manager", "employee"]);
}
