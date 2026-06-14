import { stripeEnv } from "@/lib/env";

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  if (!stripeEnv.secretKey) {
    throw new Error("Stripe is not configured for billing portal access yet.");
  }

  const body = new URLSearchParams();
  body.set("customer", params.customerId);
  body.set("return_url", params.returnUrl);

  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeEnv.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-02-25.clover",
    },
    body,
  });

  const json = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(json.error?.message ?? "Unable to create billing portal session.");
  }
  if (!json.url) {
    throw new Error("Stripe did not return a billing portal URL.");
  }

  return { url: json.url };
}
