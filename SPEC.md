# Tracelet product specification

## Objective and scope

Make public intelligence gathering accessible through six categories: Username, Email, Phone, Files, Website, and My Digital Footprint. Never fabricate findings. Preserve evidence, observation times, limitations and confidence. Similar usernames are possible matches, not proof of shared identity.

The original local-first specification remains supported. The owner subsequently requested a website running entirely in their Cloudflare account under `rylogix.tracelet.com`, with public signup. Accordingly the hosted mode uses Workers + D1 and browser file processing. It cannot execute native tools or Python subprocesses. Hosted account storage is explicitly disclosed. The local mode keeps Next.js + FastAPI + SQLite and Docker Compose.

## Functional contract

- Universal input router, compatible integration selection and graceful unavailable-module explanations.
- Bounded execution, progress, cancellation, short-lived caching, optional saved history and JSON exports.
- Six category cards and responsive dark UI. Technical tool configuration belongs in Integrations.
- Settings: availability, credentials, free-tier indication, official registration/docs links, secure masked keys, connect/replace/disconnect/test.
- Usage: request attempts, success/failure counts, actual provider header limits/remaining/reset, source provenance, local budgets, last success/update, rate status, percentage alerts when mathematically supported. Unknown values stay unknown. No invented resets or allowances.
- Personal footprint: explicit account addition, GitHub bio challenge, verify/reject by deletion, explicit daily monitoring, alerts, export and delete.
- Public hosted accounts: discoverable passkeys, verified WebAuthn origin/RP/challenge, expiring HttpOnly cookies, account ownership on every data query, account deletion.
- Secure defaults: no paid adapters, no automatic third-party registration, no API-key scraping, no authentication/rate-limit circumvention, no account-existence enumeration, no covert monitoring, no active target probing.

## Milestones and acceptance

1. Core: working UI, migrations, local launcher, router, real keyless adapters and tests.
2. Credentials and usage: encrypted storage, automatic keyless configuration, counters, quota provenance, budgets and UI.
3. Registry: modular adapters and declared capabilities; enable only validated adapters.
4. Footprint: account proof, opt-in schedules and data controls.
5. Release: dependency auditing, integration/browser testing, installation and security documentation, source packaging and CI.
6. Added hosted scope: static Next export + Workers API + D1 + public passkey accounts and custom-domain deployment.

## Explicit limitations / future work

- Sherlock, Maigret and ExifTool are registry entries, disabled until each platform's actual executable and output schema pass compatibility tests. They are not silently claimed to work.
- Broad candidate-tool expansion, duplicate finding clustering beyond one adapter per category, credit-billing adapters, configurable retention beyond the documented 30 days, account-data export import, and matching-profile suggestion review remain future work.
- Current alerts let users choose among 50/80/90/100% thresholds. Quotas currently supported use requests, not credits. No credit-based or billable provider is enabled.
- Background hosted jobs use bounded `waitUntil`, not a durable Cloudflare Queue. Interrupted jobs are labeled explicitly; there is no silent promise of eventual completion.
- Passkey sync/backup is the recovery mechanism. Password/email recovery is not implemented. Public production operators should review this limitation before launch.
- Windows/macOS launcher scripts are provided but require native-device testing. No signed desktop binaries are provided.

See docs/VALIDATION.md for observed checks. A configured domain or repository URL is never evidence of deployment/publication.
