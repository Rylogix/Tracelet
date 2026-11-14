# Cloudflare website deployment

Target: **https://rylogix.tracelet.com**. Domain names are case-insensitive. The operator must own/control `tracelet.com` in their Cloudflare account. This project cannot create ownership of that domain. A Cloudflare custom domain cannot be attached to an unrelated account's zone.

## Architecture and account requirements

- Workers serves the static Next.js export and same-origin API.
- D1 stores separate accounts, investigations, credentials, counters and profiles.
- Public signup uses passkeys/WebAuthn; no email, OAuth account, shared developer keys or paid authentication provider is required.
- Files are processed in the browser. Python/native OSINT tools are unavailable in this edition.
- Hourly Cron handles expiry and opted-in verified-account monitoring.

A Cloudflare account with Workers/D1 and zone permissions is required for deployment. Start within the current official free-tier limits if suitable; public traffic can exhaust quotas. Review https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/ . This project does not enable paid integrations or promise unlimited free hosting.

## Deploy using official Wrangler

From a computer with Node.js 22+:

```sh
cd cloudflare
npm ci
npx wrangler login
npx wrangler d1 create tracelet
```

Set the **database_id returned by Cloudflare** in `cloudflare/wrangler.jsonc`. Do not invent one. Review `routes` and `vars.APP_ORIGIN`: both target `rylogix.tracelet.com`. The account selected in Wrangler must contain the corresponding zone. You do not need to publish the code to GitHub to deploy manually, but the project repository should be created and pushed for source control.

Generate a deployment-owned encryption key and send it directly to Wrangler secret storage; never paste a key into chat, git, or frontend code:

```sh
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put ENCRYPTION_KEY
```

Back up this key securely using your organization's secret-management process if you need credential recovery. Rotating it without migrating stored ciphertext makes existing saved keys unreadable.

Then:

```sh
npm run migrate:remote
cd ../frontend
npm ci
npm run build:cloudflare
cd ../cloudflare
npm run build
npm run deploy
```

Cloudflare binds the custom domain and manages TLS. `workers_dev` and preview URLs are disabled so credentials are used only on the configured application origin. Visit the domain and create your account with a passkey. Public visitors can create their own accounts. No first account is granted administrator access; there is no application admin panel or cross-account browsing.

## Before opening public signup

Verify real sign-up/sign-in on your intended mobile browser, account isolation, provider budgets and platform quotas. Review the operator's privacy statement and Cloudflare backup policies. Users must back up/sync their passkeys; email/password recovery is not implemented. Apply Cloudflare protections appropriate to your public traffic and keep account-level spending controls in place. A public service cannot enforce another party's quota usage outside Tracelet.

## Local hosted-mode testing

```sh
cd frontend
npm ci
npm run build:cloudflare
cd ../cloudflare
npm ci
npm run migrate:local
cd ../frontend
npx playwright test --config playwright.cloudflare.config.ts
```

The test config uses local Wrangler/D1 at http://localhost:8787 and a Chromium virtual authenticator. These are real WebAuthn operations against the running application. Unit tests are separate: `cd cloudflare && npm test`. No production bypass account or fake identity is added to the application.

## Deploy from mobile using GitHub Actions

No local terminal is required for this route.

1. Confirm `tracelet.com` is an active zone in your Cloudflare account. The configured address is `rylogix.tracelet.com`.
2. In Cloudflare, copy your Account ID from the account dashboard.
3. Open https://dash.cloudflare.com/profile/api-tokens and create a custom API token. Grant Account → Workers Scripts → Edit, Account → D1 → Edit, Zone → Workers Routes → Edit, Zone → DNS → Edit, and Zone → Zone → Read. Scope account resources to the chosen account and zone resources to `tracelet.com`.
4. In https://github.com/Rylogix/Tracelet/settings/secrets/actions add two **repository secrets**, named exactly `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Never paste the token into chat or source code.
5. Open https://github.com/Rylogix/Tracelet/actions/workflows/deploy-cloudflare.yml, choose **Run workflow**, and run branch **main**. On a small screen, GitHub's desktop-site browser mode may make this control easier to find.

The workflow checks the code, creates or reuses a D1 database named `tracelet`, configures the returned database ID for that deployment, applies migrations, publishes the Worker and custom domain, and generates a deployment-owned encryption key only when one does not already exist. Subsequent deploys preserve the database and key. The generated key is sent directly to Cloudflare secret storage; it is never printed or committed. No database ID or environment file needs manual editing for this path.

After the workflow succeeds, visit https://rylogix.tracelet.com and create your passkey account. If it fails, inspect the failing step; a domain/zone error usually means the chosen account does not control `tracelet.com`, while a 403 usually means a missing token permission or resource scope. The API-key settings remain unavailable until encryption-key provisioning completes.

## Session publication status

Source is pushed to https://github.com/Rylogix/Tracelet. Cloudflare authentication still must be supplied using the secure repository-secret flow above. Local checks and GitHub publication do not establish that the production domain is live.
