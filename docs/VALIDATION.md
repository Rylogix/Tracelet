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

## Report workflow — 2026-11-14

Reorganized the website as Dashboard, Username, Email, Number, Files, Website and Report. No Auto tab. A root workflow provider preserves native results and report inclusion separately; independent entry IDs support duplicate/cached searches. Removing a report panel does not delete its source-tab result. Draft autosaves use optimistic revisions and an account-scoped server snapshot. Save to history & clear archives only included panels, then starts a clean workspace. Saved reports reopen as read-only exports from Dashboard.

- Python: 20 passed, including draft persistence, stale-save rejection, malformed entries, archive selection and running/empty archive rejection.
- Worker: 87 passed, two optional external smoke checks skipped. Report tests use real Miniflare/D1 to verify owner isolation, revision conflicts, archive filtering, fresh drafts and scoped deletion.
- Frontend static production build and TypeScript passed. Local desktop/mobile browser suite: four passed.
- Hosted local desktop/mobile: four passed, including real phone/file analysis, report removal/native retention, UTF-8 TXT, a genuine parsed PDF with Unicode title, clipboard contents, reload, archive/clear and cross-account isolation. PDF/TXT do not contain the saved optional API credential.
- Production desktop and mobile workflow tests passed individually after deployment. The combined production run exercised the shared-IP authentication safety gate; tests now wait for its legitimate reset rather than bypassing it.
- Live production website + two username searches passed through the actual UI. Both username result panels remained in their native tab after report removal; excluding one username and the website left one report panel. The octocat run returned 12 real public profile matches. GitHub was blocked on the hosted egress and was correctly labeled unavailable rather than absent.
- Migration 0004 applied to production D1. Worker deployed as 111b96bf-e3d4-4a37-9662-a9b72986e3af.

Reports retain structured metadata, not uploaded file bytes. PDF/fontkit and the report font load only on export; unsupported glyphs use explicit Unicode code points and the PDF also attaches the complete original UTF-8 text. Archived reports remain until deleted or account removal. Drafts support 100 search panels and a 1.9 MB validated payload. Request limits for other APIs remain unchanged. Docker packaging now includes the public report font; a new Docker build was not attempted because this workspace previously exhausted disk during container startup.

## Richer free observations and arrival animations — 2026-11-14

- Username adapters now retain allowlisted bios, websites, dates and public counts from the same identity-confirmed response. Unknown fields are omitted and contact dumps are not copied. Existing findings keep low identity confidence. Profile cache keys and completed-job schema versions prevent old thin responses from being reused as enriched data.
- Website: eight DNS types with TTL/validation facts, flat registrar/lifecycle/nameserver summaries, and public IPv4/ASN/prefix data from Team Cymru DNS. Email: address components, published SPF/DMARC and MTA-STS/TLS reporting records. Phone: E.164/national formats, calling code, national number and number type. Files: image dimensions, PDF dates/properties/page geometry and bounded Office/OpenDocument XML metadata.
- DNS outputs stream individually, with TTL-respecting cache reuse, cancellation checkpoints and a hosted 24-second work budget. The shared application DNS gate is 120/minute; it is not presented as a provider-confirmed allowance. Corrected zero-budget requests acquiring a shared provider slot before refusing transmission.
- Nested arrays/objects render as readable records. Stable finding keys enable short CSS entry animations without reanimating existing cards on each progress update. Reduced-motion disables animations and progress transitions.

Validation: Python 22 passed; Worker 93 passed (two optional live checks skipped in deterministic run). Actual known-profile/missing-profile/cache checks passed for the 29 username adapters. Actual expanded DNS, RDAP, Team Cymru, Gmail-domain policies and GitHub adapter test passed. Browser suite: six passed across desktop/mobile, two optional live checks skipped; includes genuinely parsed PDF/TXT/clipboard exports, metadata extraction, E.164 fields, animation presence and reduced-motion behavior. TypeScript and frontend production build passed.

Production Worker ed5380c6-fe87-4cd1-b364-d7d03552b5a5 deployed. Live website/email/two-username workflow passed against production, including network and mail policy findings, flattened registration dates and enriched profile fields. The public username fixture returned 12 actual matches; GitHub remained blocked on hosted egress and was correctly reported unavailable. RIPEstat was investigated but not enabled due to redistribution restrictions. No mandatory paid services or credentials were added. Production mobile workflow and Office metadata checks also passed (two tests), including reduced-motion behavior and Unicode report exports.

## Single-column finding pills — 2026-11-14

Findings now start collapsed in one vertical column across source tabs and reports. Every matching platform is listed immediately; the previous four-result display limit is removed. The platform name in username findings links to the exact evidence/profile URL in a separate tab with noopener/noreferrer, while the adjacent keyboard-accessible toggle expands the details downward. Stable finding identities preserve expansion during progress updates. Details render only when opened; exports continue to include the full report data. Existing entry animations and reduced-motion support remain.

The production frontend build passed. Hosted desktop/mobile browser suite: six passed, two optional external smoke checks skipped; includes collapse-aware number/document checks, report edits and full PDF/TXT/clipboard exports. Deployed Worker version 658739a7-15b9-4f3b-ae0c-de7cf32d33c5.

Production live workflow passed, verifying all 12 actual username matches render as individual pills, one-column alignment, expand/collapse state, and exact profile URLs with separate-tab behavior.
