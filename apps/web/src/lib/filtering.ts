export type DateRange = "all" | "today" | "7d" | "30d" | "90d" | "1y";

export function normalizeQuery(value: string) {
  return value.trim().toLowerCase();
}

export function matchesQuery(values: Array<string | null | undefined>, query: string) {
  const q = normalizeQuery(query);
  if (!q) return true;
  return values.some((value) => value?.toLowerCase().includes(q));
}

export function withinDateRange(value: string, range: DateRange) {
  if (range === "all") return true;

  const now = new Date();
  const created = new Date(value);

  if (range === "today") {
    return created.toDateString() === now.toDateString();
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const threshold = new Date(now);
  threshold.setDate(now.getDate() - days);
  return created >= threshold;
}

export function updateSearchParams(
  current: URLSearchParams,
  updates: Record<string, string | number | null | undefined>,
) {
  const next = new URLSearchParams(current.toString());

  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "" || value === "all") {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }

  return next;
}

export function parsePageParam(value: string | string[] | undefined, fallback = 1) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function dateRangeToBounds(range: DateRange) {
  if (range === "all") return { from: null, to: null };

  const now = new Date();
  const to = now.toISOString();
  const start = new Date(now);

  if (range === "today") {
    start.setHours(0, 0, 0, 0);
  } else {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
    start.setDate(now.getDate() - days);
  }

  return { from: start.toISOString(), to };
}
