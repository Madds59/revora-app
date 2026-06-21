/**
 * Normalize a locale value to the supported application locales.
 *
 * @param {string | null | undefined} locale
 * @returns {"en" | "ar"}
 */
export function normalizeLocale(locale) {
  return locale === "ar" ? "ar" : "en";
}

/**
 * Replace or prefix the locale segment in a path.
 *
 * @param {string} pathname
 * @param {"en" | "ar" | string | null | undefined} nextLocale
 * @returns {string}
 */
export function switchLocalePath(pathname, nextLocale) {
  const raw = String(pathname ?? "");
  const locale = normalizeLocale(nextLocale);
  const hashIndex = raw.indexOf("#");
  const searchIndex = raw.indexOf("?");
  const cutIndex =
    hashIndex === -1
      ? searchIndex
      : searchIndex === -1
        ? hashIndex
        : Math.min(searchIndex, hashIndex);

  const pathPart = cutIndex === -1 ? raw : raw.slice(0, cutIndex);
  const suffix = cutIndex === -1 ? "" : raw.slice(cutIndex);
  const normalizedPathname = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;
  const segments = normalizedPathname.split("/").filter(Boolean);

  while (segments.length > 0 && (segments[0] === "en" || segments[0] === "ar")) {
    segments.shift();
  }

  const normalizedPath = segments.length > 0 ? `/${segments.join("/")}` : "/";
  const nextPath = normalizedPath === "/" ? `/${locale}` : `/${locale}${normalizedPath}`;
  return `${nextPath}${suffix}`;
}
