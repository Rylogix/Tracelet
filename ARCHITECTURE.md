# Architecture

## Shared interface

Next.js App Router, TypeScript, Tailwind and a shadcn-style Radix/CVA button component. UI uses a same-origin `/api` contract. Local builds proxy API routes to FastAPI; hosted builds statically export and Workers serve assets and APIs from one origin. `AuthGate` detects a local backend versus hosted authentication. Hosted data always requires a server-validated session regardless of UI state.

## Cloudflare mode

`cloudflare/src/index.ts` routes requests, scopes every query to the authenticated account, coordinates search jobs, and handles scheduled cleanup/monitoring. `auth.ts` verifies passkey registration and authentication, consumes single-use five-minute challenges, hashes random session tokens before storage, and issues 30-day HttpOnly, Secure, SameSite=Strict cookies. No passwords or biometric data are stored.

D1 contains accounts, passkeys, sessions, settings, jobs, credentials, usage, provider rate locks, footprint records and alerts. Owner foreign keys prevent orphan writes after account deletion. API keys use AES-256-GCM with a random IV and a deployment-owned secret stored through Wrangler. No secret is placed in static assets, git, responses or application logs.

Provider requests are sent only to fixed official API origins, or to registry endpoints supplied by the trusted IANA RDAP bootstrap. No arbitrary website is fetched. Redirects are rejected. Inputs are never passed to a shell. Request bodies are bounded to 16 KB. Response bodies are bounded to 2 MB. Public signup is rate-limited per connecting IP; searches per account; external calls use shared atomic D1 rate gates and per-account budgets. Failed requests count as local attempts, not claimed billable credits.

Jobs persist progress in D1 and use bounded `waitUntil` background execution. Cancellation prevents subsequent modules and result persistence; in-flight fetches end at their timeout. Jobs whose runtime was interrupted are marked interrupted after 60 seconds. History is opt-in; ephemeral jobs expire after one hour and saved jobs after 30 days. Hourly cleanup removes expired records. Five-minute eligible-result reuse is scoped to one account.

Hourly scheduled tasks process up to ten due verified GitHub profiles and clean expired records. Per-account monitoring is off by default and interval is at least 24 hours. This is bounded best-effort scheduling, not guaranteed exact-time delivery.

Browser files run in a dedicated Web Worker terminated after 12 seconds. Images use exifr and browser decoders; PDFs use pdf-lib; other files receive size/type/hash only. No bytes are sent to the hosted API.

## Local mode

FastAPI runs a single process with a bounded asyncio task queue and cooperative cancellation. SQLite uses WAL, parameterized SQL, versioned initialization and transactional request reservations. Secrets use Fernet with an auto-generated mode-0600 local key inside the private data directory. Local services bind to loopback. Docker exposes only frontend loopback, keeps the API on the internal Compose network, drops capabilities and runs unprivileged users.

Local backend file analysis runs in a separate Python process with a timeout and Unix CPU/address-space/file-output limits. Windows relies on subprocess timeout and input bounds. Local server is single-user and is not suitable for directly exposing on a public interface.

## Adapter contract

Each registry item declares input kinds, credential requirements, quota reporting, safety rate, dependencies, license/docs, execution availability, timeout/cancellation and normalized outputs. Concrete dispatch is independent of UI components. Adding a provider requires tests, terms/license review, redaction and quota tests before enabling it.
