# Validation record — 2026-11-14

## Passed in the development environment

- Python: **18 pytest tests**, using the actual phone and image libraries, isolated file subprocess, key encryption, private-target/origin rejection, personal budgets, concurrent budget reservations, configurable alerts and GitHub ownership-gated monitoring.
- Hosted TypeScript: **16 tests with live provider checks enabled**. Uses a real local Miniflare D1 database, verifies schema/foreign keys, zero-budget enforcement, unknown quota values, failed-request accounting, confirmed exhaustion and AES-GCM authentication. Real DNS, RDAP and GitHub adapters returned public data for example.com / GitHub's public octocat account; requests were counted in D1.
- Local Playwright: **4 checks across desktop and mobile**, including real phone results, usage/credential controls and horizontal overflow checks.
- Hosted Playwright: desktop/mobile virtual-passkey registration, sign-out/login, real phone results, a second account denied access to the first account's job and API-key connection, browser-only image analysis with no upload request, and unauthenticated/cross-origin rejection. The final run also checks registration-challenge replay rejection.
- Next.js local production build and Cloudflare static export build.
- Workers TypeScript check and Wrangler production dry-run bundle.
- Fresh local D1 migration and schema tests.
- Python requirement resolution audit, installed Python environment audit, and npm audits for frontend and Cloudflare dependencies: **no known vulnerabilities reported** at validation time.
- Docker Compose configuration validation. Backend Docker image built successfully.

## Observed limitations

- The initial direct local-Worker live-network test failed because this execution environment requires an outbound proxy that workerd does not use automatically. It also caught an unsupported redirect option, which was fixed to `manual`. The final live adapter checks use Node's official proxy-aware fetch transport plus real Miniflare D1, not fabricated responses. The later production checks below passed Cloudflare-origin networking. The optional `TRACELET_LIVE=1` browser-network smoke is separate from deterministic CI and may fail in proxy-constrained local environments.
- The complete Docker build reached frontend compilation/type-check/static generation but could not finish in this machine's small filesystem (`ENOSPC` during standalone packaging). Backend image creation succeeded. A full Compose runtime smoke is not claimed. Container builds behind this environment's TLS-inspecting proxy used a temporary BuildKit CA secret, without disabling TLS verification; that local override is not shipped.
- No live VirusTotal/AbuseIPDB credentials were available. Keys remain **Connection test required** until a user's real connection test succeeds. Replacing a key invalidates prior connection-test health. AbuseIPDB remains disabled.
- Sherlock, Maigret and ExifTool have no validated runtime adapter in this release and remain disabled. No claim is made about their current upstream maintenance or compatibility.
- Native Windows/macOS installation, real-device passkeys, production Cron delivery and an independent security audit remain outstanding.
- The initial GitHub repository-creation token lacked permission. The owner subsequently created Rylogix/Tracelet, and the tested source was pushed successfully.
- Direct Wrangler login was initially unavailable. The owner later authorized Cloudflare’s official MCP connection and the production resources were deployed through it, as recorded below.

## Commands

```sh
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
.venv/bin/pip-audit -r backend/requirements.txt
.venv/bin/pip-audit
cd frontend && npm ci && npm run build && npm run test:e2e
npm run build:cloudflare
cd ../cloudflare && npm ci && TRACELET_LIVE=1 npm test && npm run build
cd ../frontend && npx playwright test --config playwright.cloudflare.config.ts
```

For deterministic Workers tests without real external requests, run `npm test` without `TRACELET_LIVE`. The optional real-provider test is explicitly skipped. No test fixture is used as a real application result.

## Production deployment — 2026-11-14

- Live URL: https://tracelet.rylogix.com, using the owner's active rylogix.com zone.
- Worker `tracelet`, a new dedicated D1 database, migrated schema, hourly schedule, custom-domain TLS, and an application-owned AES-GCM encryption secret are deployed. Secret material was generated inside Cloudflare and not returned in logs or committed.
- **Three production Playwright checks passed** against the actual HTTPS domain: public passkey signup, replay rejection, sign-out/sign-in, real phone lookup, account and credential isolation, browser-only image metadata with no upload; unauthenticated/cross-origin rejection; and real DNS plus RDAP queries for example.com.
- Temporary production test accounts and their data were removed through the account-deletion API.
- Production test requests use the environment's required outbound proxy. Synthetic CF-Connecting-IP headers remain limited to local tests: sending them to Cloudflare itself correctly triggers Cloudflare error 1000. No zone security settings were weakened to run tests.
- The app's native tool and integration limitations remain as documented in INTEGRATIONS.md. Native Windows/macOS and real-device passkey testing remain outstanding.

## Matte charcoal interface update — 2026-11-14

- Replaced the interface with matte charcoal surfaces, white controls/icons/outlines, and color restricted to compact provider-status and confidence indicators. Removed promotional filler outside the signup and workspace hero headlines.
- Added self-hosted Inter/Manrope fonts, a shared active-navigation shell, mobile bottom navigation, keyboard search focus, integration availability filters, readable evidence properties, and expandable original source data. Search/export data and server access controls are unchanged.
- Next.js static-export and local production builds, Workers dry-run, and npm dependency audit passed.
- Desktop/mobile hosted browser checks passed, including passkeys, real phone results, shortcut/example controls, active navigation, integration filters and overflow checks on usage/integrations/footprint. Local browser checks passed after starting the local test API; the initial local attempt reached the UI before that API was running.
- Three production browser checks passed at https://tracelet.rylogix.com, including real DNS/RDAP queries, credential/account isolation, image analysis without uploads, and the redesigned routes. Temporary test accounts were deleted.
- Live sign-in layout inspected at 320, 390, 768, 1024 and 1440 pixels. Visual captures reviewed for desktop/mobile sign-in, workspace, and evidence cards.
- Deployment preserved the existing production database and encryption secret.
