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

## Username discovery and minimal interface — 2026-11-14

- Python: 20 tests passed.
- Worker: 83 tests passed with TRACELET_LIVE=1, including all 29 actual positive profile requests, missing-profile behavior, cache reuse and attempt accounting. Open Collective returns a GraphQL error for an unknown slug; Tracelet conservatively marks this unavailable.
- Frontend static production build and Worker TypeScript check passed.
- Hosted browser tests: desktop/mobile signup, real phone search, credential masking, account isolation and local file processing passed (4 deterministic checks).
- Production desktop: passkeys, account isolation, DNS, RDAP and a complete 29-platform username job passed. GitHub octocat evidence confirmed; test accounts deleted.
- Applied D1 migration 0002 and deployed Worker version 8dca6aac-ad45-4cb6-b492-554c07355402.

The interface uses compact sign-in/create-account actions, a single search field, type filters and expandable technical details. Native Sherlock/Maigret remain disabled; the hosted username engine uses the documented public API catalog. No claim of exhaustive internet coverage is made. External provider availability is checked per request.

## Footprint removal — 2026-11-14

Removed the page, navigation, API routes, verification and scheduled monitoring. Migration 0003 removes hosted footprint records and alerts; local migration 4 removes footprint, ownership and alerts tables. Account deletion remains in Settings. Python: 18 passed. Worker: 81 passed, 2 optional live tests skipped. Hosted desktop/mobile browser checks: 4 passed. Static build and TypeScript passed.

## Sherlock Cloudflare container adapter — 2026-11-14

Prepared a private Python service and container-enabled Durable Object, plus an explicit opt-in main Worker configuration. The normal production config keeps it disabled and uses the free public API checks. Deployed inactive adapter code to the existing Worker; no paid service binding is enabled.

- Real Sherlock 0.16.2 Linux/Python service scan: completed 411 eligible catalog checks for the public fixture octocat within the 180-second deadline: 112 heuristic possible matches, 211 absent, 87 unavailable, one skipped. Matching handles do not establish identity. This does not validate every site's detection rule or terms.
- Real child-process cancellation passed. Earlier 90-second run correctly preserved partial results at its deadline; final configuration allows 180 seconds.
- Python service: 10 tests passed, including request validation, busy gate, cancellation, private-target blocking and HTTP/WAF error classification. Existing backend: 18 passed.
- Worker suite: 85 passed, two optional live checks skipped. TypeScript for main Worker and container controller passed. Opt-in main Worker dry-run and binding type generation passed.
- Docker image built successfully with an optional development CA secret. Container runtime could not be started in this workspace because Docker's VFS copy exhausted available disk. Only this task's image/cache artifacts were removed afterward. Native service execution was tested; Cloudflare-hosted container execution is not yet validated.
- Existing desktop/mobile browser tests: four passed, two optional external smoke tests skipped. Production mobile: two passed, one optional live test skipped. Production mobile sign-out assertion was updated to wait for the actual Sign in button; the shared hero heading could previously satisfy that wait before logout completed.
- Cloudflare Containers API refused account access: Workers Paid required. Billing endpoints are not accessible through the current OAuth connection. No plan upgrade, paid container deployment or billing modification was performed.

See cloudflare/sherlock/README.md for the exact catalog provenance, constraints, account requirement, deployment commands and limitations.
