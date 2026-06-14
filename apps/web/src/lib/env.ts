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
