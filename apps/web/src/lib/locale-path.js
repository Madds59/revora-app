/**
 * Replace or prefix the locale segment in a path.
 *
 * @param {string} pathname
 * @param {"en" | "ar"} nextLocale
 * @returns {string}
 */
export function switchLocalePath(pathname, nextLocale) {
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const segments = normalizedPathname.split("/").filter(Boolean);

  if (segments.length > 0 && (segments[0] === "en" || segments[0] === "ar")) {
    segments[0] = nextLocale;
    return `/${segments.join("/")}`;
  }

  if (normalizedPathname === "/") {
    return `/${nextLocale}`;
  }

  return `/${nextLocale}${normalizedPathname}`;
}
