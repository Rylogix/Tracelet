# Architecture

## Shared interface

Next.js App Router, TypeScript, Tailwind and a shadcn-style Radix/CVA button component. UI uses a same-origin `/api` contract. Self-hosted Inter (OFL-1.1) and a lazily loaded DejaVu font for PDF reports, a shared responsive workspace shell, active navigation, and normalized evidence cards provide consistent presentation. Raw source data stays available behind an expandable disclosure. Local builds proxy API routes to FastAPI; hosted builds statically export and Workers serve assets and APIs from one origin. `AuthGate` detects a local backend versus hosted authentication. Hosted data always requires a server-validated session regardless of UI state.

## Cloudflare mode

`cloudflare/src/index.ts` routes requests, scopes every query to the authenticated account, coordinates search jobs, and handles scheduled cleanup. `auth.ts` verifies passkey registration and authentication, consumes single-use five-minute challenges, hashes random session tokens before storage, and issues 30-day HttpOnly, Secure, SameSite=Strict cookies. No passwords or biometric data are stored.

D1 contains accounts, passkeys, sessions, settings, jobs, credentials, usage, provider rate locks, report drafts and archived reports. Owner foreign keys prevent orphan writes after account deletion. API keys use AES-256-GCM with a random IV and a deployment-owned secret stored through Wrangler. No secret is placed in static assets, git, responses or application logs.

Provider requests are sent only to fixed official API origins, or to registry endpoints supplied by the trusted IANA RDAP bootstrap. No arbitrary website is fetched. Redirects are rejected. Inputs are never passed to a shell. Request bodies are bounded to 16 KB, with a 2 MB transport limit for report snapshots (1.9 MB validated payload). Response bodies are bounded to 2 MB. Public signup is rate-limited per connecting IP; searches per account; external calls use shared atomic D1 rate gates and per-account budgets. Failed requests count as local attempts, not claimed billable credits.

Jobs persist progress in D1 and use bounded `waitUntil` background execution. Cancellation prevents subsequent modules and result persistence; in-flight fetches end at their timeout. Jobs whose runtime was interrupted are marked interrupted after 60 seconds. History is opt-in; ephemeral jobs expire after one hour and saved jobs after 30 days. Hourly cleanup removes expired records. Five-minute eligible-result reuse is scoped to one account.

Hourly scheduled tasks clean expired records.

Browser files run in a dedicated Web Worker terminated after 12 seconds. Images use exifr and browser decoders; PDFs use pdf-lib; other files receive size/type/hash only. No bytes are sent to the hosted API.

## Local mode

FastAPI runs a single process with a bounded asyncio task queue and cooperative cancellation. SQLite uses WAL, parameterized SQL, versioned initialization and transactional request reservations. Secrets use Fernet with an auto-generated mode-0600 local key inside the private data directory. Local services bind to loopback. Docker exposes only frontend loopback, keeps the API on the internal Compose network, drops capabilities and runs unprivileged users.

Local backend file analysis runs in a separate Python process with a timeout and Unix CPU/address-space/file-output limits. Windows relies on subprocess timeout and input bounds. Local server is single-user and is not suitable for directly exposing on a public interface.

## Adapter contract

Each registry item declares input kinds, credential requirements, quota reporting, safety rate, dependencies, license/docs, execution availability, timeout/cancellation and normalized outputs. Concrete dispatch is independent of UI components. Adding a provider requires tests, terms/license review, redaction and quota tests before enabling it.

## Shared report state

`WorkflowProvider` lives inside the authenticated root layout. It keeps source-tab entries and report inclusion separate, polls active jobs across navigation and serializes autosaves through `/api/workspace`. Each entry has its own ID, including repeat searches that reuse a cached job. Reports use optimistic revisions so simultaneous tabs cannot silently overwrite one another. D1 migration 0004 / local migration 5 stores the snapshots. One active draft per account is enforced by a unique partial index. Archives contain only included entries and remain until explicitly deleted or the account is removed. Search-job TTLs are separate from report snapshot storage.

`/api/reports/archive` atomically changes a saved draft into an archive; the next workspace request creates the fresh draft. Source results remain after report removal, and all tabs reset after finishing. Stored reports do not retain uploaded file bytes or backend API credentials. Browser exports generate PDF locally with pdf-lib/fontkit (loaded only for export), UTF-8 text and clipboard content. Unsupported PDF font glyphs use visible Unicode code points; the original UTF-8 report is attached to the PDF without character loss. No public paste service receives the report.
