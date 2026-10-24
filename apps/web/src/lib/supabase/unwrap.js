// Reading a Supabase result without reading its error.
//
// `const { data } = await supabase.from(...)` is the shape that hid the
// PGRST201 outage: on failure `data` is null, `data ?? []` is an empty array,
// and a page that renders an empty state for "no rows" presents a hard query
// failure as "you have no vehicles". The user is told to create data they
// already have, and nothing is logged.
//
// These helpers make that impossible by construction: a failed query raises,
// so the route's error.tsx boundary renders instead of its empty state.
//
// Authored as .js (ESM) to match lib/validation/*.js, so the same code runs in
// server components and in the offline node test suite.

/** A Supabase/PostgREST query that failed. */
export class SupabaseQueryError extends Error {
  /**
   * @param {{message?: string, code?: string, details?: string, hint?: string}} error
   * @param {string} [section] where the query ran, for the error report
   */
  constructor(error, section) {
    const code = error?.code ? ` [${error.code}]` : "";
    super(`${section ? `${section}: ` : ""}${error?.message ?? "query failed"}${code}`);
    this.name = "SupabaseQueryError";
    this.code = error?.code;
    this.details = error?.details;
    this.hint = error?.hint;
    this.section = section;
  }
}

/**
 * Rows from a Supabase list query, or throw.
 *
 * Never returns `[]` for a failed query -- that is the whole point. `null` data
 * with no error is a genuinely empty result and yields `[]`.
 *
 * @template T
 * @param {{data: T[] | null, error: unknown}} result
 * @param {string} [section] label used in the raised message and the report
 * @returns {T[]}
 */
export function unwrapRows(result, section) {
  if (result?.error) throw new SupabaseQueryError(result.error, section);
  return result?.data ?? [];
}

/**
 * A single row from a Supabase query, or throw. `null` is a legitimate answer
 * for `.maybeSingle()`, so it is passed through; only an error raises.
 *
 * @template T
 * @param {{data: T | null, error: unknown}} result
 * @param {string} [section]
 * @returns {T | null}
 */
export function unwrapRow(result, section) {
  if (result?.error) throw new SupabaseQueryError(result.error, section);
  return result?.data ?? null;
}
