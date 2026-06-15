/**
 * Retainer calculator access is restricted to business owners and business
 * managers. Super admin is handled separately by server-side guards.
 * @param {string | null | undefined} role
 */
export function canUseRetainerCalculator(role) {
  return role === "business_owner" || role === "manager";
}
