# Security and privacy

Report vulnerabilities privately to the repository owner's GitHub security advisory channel once published. Do not post real API keys, personal investigations, or exploitable account data in public issues. This initial release has automated checks and a development security review; it has not had an independent audit.

## Boundaries

- Local mode is single-user, loopback-only. Do not expose the FastAPI/local launcher directly to the internet.
- Hosted mode requires public passkey authentication before any private API. Every user-owned row is account-scoped. Never deploy with authentication removed.
- Hosted API keys are AES-GCM encrypted using a Wrangler deployment secret. Local credentials are Fernet-encrypted with a protected local key. Operators with application code/key access can decrypt stored credentials; this is not end-to-end encryption.
- Keep encryption keys backed up separately. Losing one makes saved credentials unrecoverable. Rotation/multi-key migration is not automated.
- API responses and exports contain findings, never provider secrets. Raw provider headers and exception traces are not logged. Queries are not written to access logs by the launch scripts.
- No arbitrary target fetches in hosted mode, no active vulnerability scanning, no shell interpolation. Website requests go to known DNS/RDAP/reputation providers only. Local RDAP redirects validate public domains; avoid exposing the local API outside a trusted single-user machine.
- Hosted files remain in a browser worker, capped at 10 MB with a 12-second timeout. Local parsing runs out of process with bounds. No uploads are retained deliberately. Framework multipart spooling in local mode is closed after reading.
- No telemetry in Tracelet. Next telemetry is disabled by provided build/launch commands. Provider lookups necessarily disclose the queried identifier/domain and network IP to those providers.
- Matching usernames never establish shared identity. GitHub bio challenges prove observed public profile control at verification time, not legal identity or permanent ownership.
- Monitoring requires verified control and explicit opt-in. A later account transfer cannot be detected automatically; disable/reverify when account ownership changes.
- Hosted unsaved jobs expire after one hour; saved jobs after 30 days; deletion occurs at the next hourly cleanup. Local saved searches are pruned at startup after 30 days. Browser/local memory may retain transient results until restart/reload or bounded eviction.
- Hosted account deletion removes application data; Cloudflare recovery/backup retention is controlled by the operator and platform.

## Public operations

Use Cloudflare managed protections and operator-level quotas as appropriate for a public service. Set spending alerts in Cloudflare. Signup/search/provider limits reduce abuse but do not guarantee a public deployment cannot exhaust a free infrastructure tier. Keep dependency audits and tests enabled. Passkeys need compatible browsers and secure origins; advise users to sync/backup keys. Password/email recovery is not available.
