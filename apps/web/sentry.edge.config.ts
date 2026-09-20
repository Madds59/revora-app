import * as Sentry from "@sentry/nextjs";

import { sentryEnv } from "@/lib/env";
import { beforeSend } from "@/lib/sentry-shared";

if (sentryEnv.dsn) {
  Sentry.init({
    dsn: sentryEnv.dsn,
    environment: sentryEnv.environment,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend,
  });
}
