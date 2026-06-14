export type AccountIntent = "business_owner" | "customer" | "staff_invited";

export const ACCOUNT_INTENTS: AccountIntent[] = [
  "business_owner",
  "customer",
  "staff_invited",
];

export function isAccountIntent(value: string | null | undefined): value is AccountIntent {
  return !!value && ACCOUNT_INTENTS.includes(value as AccountIntent);
}
