# Email receipt setup

Email receipts are sent through [Resend](https://resend.com). The send action
reads its configuration from the Convex deployment environment, so no secret is
committed to the repository.

## Required environment variable

- `RESEND_API_KEY` is your Resend API key. The send action will not run without
  it.

## Optional environment variable

- `RESEND_FROM` is the sender address. This must be a verified sender in your
  Resend account. When unset, it defaults to `kodapos <onboarding@resend.dev>`.

## Where to set these

Set both variables in the Convex dashboard, under the deployment's environment
variables. For now they live on the DEV deployment; move them to the production
deployment when you ship to production.

## Behavior without a key

If `RESEND_API_KEY` is missing, the send action returns a clear
"Email belum dikonfigurasi" error and nothing crashes. The user sees the error
in the receipt dialog and can retry once the key is configured.

## Receipt content language

The receipt content itself is always English, regardless of the app's interface
language. Only the surrounding UI controls (such as the "Email receipt" and
"Send email" buttons) follow the selected interface language.
