# API limits and usage provenance

Settings → API usage shows recorded provider usage and lets users set personal request caps. Choose a source to see its allowance, remaining quota, local attempts and reset when available. The dashboard summarizes locally tracked requests.

Tracelet never invents an external allowance. Missing provider values are `null` and rendered **Unknown**. Offline/browser modules do not consume external API quota. A configured local safety rate is not a provider-confirmed allowance.

| Provider | Local safety gate | Reported quota | Billing adapter |
|---|---:|---|---|
| GitHub public API | 10 requests/minute | X-RateLimit headers when supplied; anonymous limits can be shared across an egress IP | None |
| Google Public DNS | 120 requests/minute | Unknown unless official response headers supply values | None |
| RDAP registries | 10 requests/minute | Unknown unless registry supplies headers | None |
| VirusTotal domain API | 4 requests/minute | Headers if supplied; otherwise unknown. No guessed monthly allocation | None; use own free-tier key under provider terms |

Counters reserve an attempted external request before transmission. HTTP failures and network errors are recorded. Cache hits do not consume a request. Local attempts cannot establish provider-billed consumption; external use of the same key is not visible except through provider reports. Provider-confirmed remaining values are shown separately from lifetime local attempts. No paid integration is enabled and Tracelet does not purchase credits. Saving or replacing a credential requires a successful connection test before search routing enables it.

Local budgets are lifetime attempt caps for that provider/account, including failures, until changed. They have no invented daily/monthly reset. Set a zero budget to disable network requests for a provider. Unknown allowance permits keyless requests only within safety gates and your budget. Exhausted reported quota is skipped; hosted requests can resume after an official known reset. 429 responses honor numeric or date Retry-After in hosted mode; local mode uses numeric Retry-After with a conservative fallback.

Hosted rate locks are atomic and shared across users to protect common egress limits. The local edition uses per-provider asyncio locks and SQLite atomic budget reservations. Both are single deployed application instances; deploying additional independent instances would need shared quota coordination.

Percentage alerts use provider limit and remaining only, at 50%, 80%, 90%, 100%. Settings → Usage alerts lets users choose a subset of thresholds, stored through `/api/usage/alerts` in either deployment mode. Unknown percentages produce no false exhaustion alerts. Reset frequency is unknown unless a future validated provider adapter explicitly reports it.

No credit-metered adapter or official usage-account endpoint is enabled in this version. The registry and UI must not pretend that generic response headers cover provider-specific endpoint billing, credit costs, separate endpoint buckets, or shared personal accounts. Those adapters require provider-specific tests before release.

Cloudflare infrastructure usage is governed by your Cloudflare account and current plan; inspect the Cloudflare dashboard. Tracelet does not claim to meter all Workers/D1 account-wide usage. Check current official pricing and configure operator controls before public launch.

Username adapters each have a local safety limit of 10 requests/minute, an independent personal budget and request counters. Stack Overflow reports official quota_max/quota_remaining and backoff in JSON; other adapters use available response headers, otherwise their allowance remains unknown. Cache hits make no external request. Public API availability varies by network and provider; failures are displayed as unavailable, never as absence.

Optional Sherlock container counters measure scan start attempts, not external website requests. The operator cap is 20 start attempts/day globally, one/minute, with one active child process and a 180-second deadline. Per-account budgets are supported. External website quotas remain unknown. This is not infrastructure billing metering or a hard spending cap. The container stays disabled until the operator authorizes paid infrastructure.

Expanded DNS, email policy and Team Cymru network lookups share the same DNS request counter, personal budget and 120/minute application gate (two requests/second). This is a conservative local safety limit, not a provider-confirmed allowance. Team Cymru uses cacheable public DNS queries and needs no key or account. No RIPEstat integration is enabled. Cached DNS answers do not reserve another request. Zero-budget requests are rejected before acquiring the shared provider slot, so they cannot unnecessarily block other users.
