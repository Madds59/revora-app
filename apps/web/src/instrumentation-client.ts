import * as Sentry from "@sentry/nextjs";

import { beforeSend } from "@/lib/sentry-shared";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      "development",
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
}
