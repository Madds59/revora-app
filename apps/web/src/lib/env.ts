/**
 * Centralized access to the public Supabase env vars with a clear error when
 * they are missing (the most common setup mistake). See `.env.local.example`.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in (see README).`,
    );
  }
  return value;
}

export const supabaseEnv = {
  url: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  anonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};

export const stripeEnv = {
  secretKey: process.env.STRIPE_SECRET_KEY ?? null,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
};

/**
 * Inbound webhook configuration. Platform-level, not per tenant: one Meta app
 * serves every business, so the app secret and the subscription verify token
 * are deployment-wide. Per-tenant routing is a database lookup against
 * inbound_channel_routes, never an environment variable.
 *
 * Both are nullable so the build and every unrelated test run without them;
 * the routes refuse to process anything when they are unset.
 */
export const inboundEnv = {
  metaAppSecret: process.env.META_APP_SECRET ?? null,
  metaVerifyToken: process.env.META_VERIFY_TOKEN ?? null,
};

export const openAiEnv = {
  apiKey: process.env.OPENAI_API_KEY ?? null,
  model: process.env.OPENAI_MODEL ?? null,
};

/**
 * Sentry is opt-in: with no DSN every capture is a console fallback and the
 * build is unchanged. `publicDsn` is the browser DSN (NEXT_PUBLIC_), `dsn`
 * is server/edge. Both usually hold the same value.
 */
export const sentryEnv = {
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? null,
  publicDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? null,
  environment:
    process.env.SENTRY_ENVIRONMENT ?? process.env.VERCEL_ENV ?? "development",
};
