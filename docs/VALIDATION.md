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

- The initial direct local-Worker live-network test failed because this execution environment requires an outbound proxy that workerd does not use automatically. It also caught an unsupported redirect option, which was fixed to `manual`. The final live adapter checks use Node's official proxy-aware fetch transport plus real Miniflare D1, not fabricated responses. Production Cloudflare-origin network behavior still needs a post-deployment smoke test. The optional `TRACELET_LIVE=1` browser-network smoke is separate from deterministic CI and may fail in proxy-constrained local environments.
- The complete Docker build reached frontend compilation/type-check/static generation but could not finish in this machine's small filesystem (`ENOSPC` during standalone packaging). Backend image creation succeeded. A full Compose runtime smoke is not claimed. Container builds behind this environment's TLS-inspecting proxy used a temporary BuildKit CA secret, without disabling TLS verification; that local override is not shipped.
- No live VirusTotal/AbuseIPDB credentials were available. Keys remain **Connection test required** until a user's real connection test succeeds. Replacing a key invalidates prior connection-test health. AbuseIPDB remains disabled.
- Sherlock, Maigret and ExifTool have no validated runtime adapter in this release and remain disabled. No claim is made about their current upstream maintenance or compatibility.
- Native Windows/macOS installation, real-device passkeys, production Cron delivery and an independent security audit remain outstanding.
- GitHub repository creation returned `Resource not accessible by integration (createRepository)`. A subsequent read did not find Rylogix/Tracelet. No remote repository was created or pushed.
- Wrangler reported no authenticated Cloudflare account. No D1 database, deployment secret, custom domain, production deployment or public release was created remotely.

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
