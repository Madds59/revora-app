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
