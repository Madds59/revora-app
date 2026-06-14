# Revora Super Admin Bootstrap

Revora super admin access is platform-level only. It is never selectable in
public signup and it is never derived from `account_intent`.

## Model

- A super admin is a normal Supabase Auth user plus a row in
  `public.platform_admins`.
- The user must sign up first and set their own password, or complete a
  Supabase magic-link / password-reset flow.
- The bootstrap script grants access only to an existing Auth user.
- The service-role key is used locally/manual only and must never be committed,
  pasted into docs, or exposed to the browser.

## Intended production admins

- `madd59productions@gmail.com`
- `moda.imf1997@gmail.com`

## Manual production steps

Run these from your local terminal only:

```bash
cd ~/Downloads/Revora-app

export NEXT_PUBLIC_SUPABASE_URL="https://yqscayjvvnpsvocqrrot.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="PASTE_PRODUCTION_SERVICE_ROLE_KEY_HERE"

node apps/web/scripts/grant-super-admin.mjs madd59productions@gmail.com
node apps/web/scripts/grant-super-admin.mjs moda.imf1997@gmail.com

unset SUPABASE_SERVICE_ROLE_KEY
```

After promotion, log in and open:

```text
https://revora-app.vercel.app/en/admin
```

## Safety notes

- Do not create a password in code.
- Do not commit `.env` files or service-role keys.
- Do not use `owner@vrf.test`, `password1234`, or other smoke-test credentials
  as production admin accounts.
- If the user has not signed up yet, the script will fail and instruct you to
  create the account first.
