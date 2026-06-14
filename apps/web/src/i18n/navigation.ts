import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Locale-aware navigation. Use these in place of next/link + next/navigation so
// hrefs/redirects keep the active locale prefix and usePathname strips it.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
