/**
 * Lead vocabulary types.
 *
 * Declared here as literal unions because lib/leads.js is a .js module -- it
 * has to be, so `node --test` can import it without a build step, matching
 * lib/notifications and lib/vehicle-intelligence. A JSDoc `const` array cannot
 * produce a literal union, so the members are written twice: once as values
 * there, once as types here.
 *
 * That duplication is checked, not trusted: leads-queue.test.mjs parses this
 * file and asserts the unions match the arrays in lib/leads.js, which in turn
 * are asserted against the check constraints in migration 0048.
 */

export type LeadStatus =
  | "new"
  | "triaging"
  | "qualified"
  | "booked"
  | "converted"
  | "lost"
  | "spam"
  | "duplicate";

export type LeadUrgency = "unknown" | "low" | "medium" | "high" | "critical";

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
