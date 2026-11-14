# Sherlock on Cloudflare

This optional private service runs **Sherlock 0.16.2** in a normal Linux/Python
Cloudflare Container. Tracelet's site remains a Worker with D1. No public
container URL, browser API key, third-party registration or separate host is
needed. The main Worker reaches it through a service binding.

## Account requirement

Cloudflare Containers requires **Workers Paid**, starting at $5/month, with
metered CPU, memory, disk and network charges after included usage. The current
Tracelet account was rejected by the Containers API for lacking this plan on
2026-11-14. No billing changes have been made. See
[official pricing](https://developers.cloudflare.com/containers/platform/pricing/).

Keep `wrangler.jsonc` as the free deployment. The alternative
`../wrangler.sherlock.jsonc` explicitly opts into the container. Deploy it only
after the account owner approves paid infrastructure and its operating limits.
The safety budgets below are **not a hard dollar spending cap**.

## Maintainer deployment

From `cloudflare`, using the authenticated account:

```sh
npx wrangler deploy --config sherlock/wrangler.jsonc
npx wrangler deploy --config wrangler.sherlock.jsonc
```

The first command builds the Docker image, uploads the private service and
provisions its container-enabled Durable Object. Wait for provisioning before
the first live search. The second attaches the existing Tracelet site. Preserve
the existing D1 and encryption secret. To disable new Sherlock searches, deploy
the normal `wrangler.jsonc` again.

The container schema and direct Durable Object API were checked against
Wrangler 4.162.0 and Cloudflare's November 2026 documentation. The service uses
one named Durable Object and a `basic` instance. It does not expose Workers.dev,
preview URLs or custom-domain routes. The only caller is the Tracelet Worker.

## Search behavior and limits

- Username searches prefer Sherlock when the binding and explicit operator
  flag are enabled. If starting Sherlock fails, the existing 29 public API
  checks remain the fallback.
- Bundled catalog: 411 eligible sites after upstream exclusions, NSFW flags,
  non-HTTPS endpoints and write-method probes are removed. This number describes
  eligible checks, **not 411 validated working platforms**. Blocking, removed
  pages and changed detection rules can reduce coverage.
- Batches of at most 20 requests; four-second per-request timeout; 180-second
  wall-clock limit. A scan that reaches the deadline retains actual findings
  and is explicitly partial. Unfinished sites are not reported as absent.
- One scan at a time, a shared one-minute gate, at most 20 start attempts per
  UTC day, and per-account lifetime scan budgets. Busy/exhausted starts fall
  back to the public API engine. There is no automatic retry of blocked sites,
  proxy rotation, CAPTCHA bypass, Tor or authentication bypass.
- Completed and partial Sherlock snapshots are reused for five minutes per account; repeated searches avoid another container scan.
- Polling updates the existing results dashboard and saves snapshots under the
  authenticated account in D1. Cancel terminates the child process. In-flight
  startup cancellation is checked before publishing the job.
- Container inactivity timeout: 210 seconds. Transient process state expires on
  restart; Tracelet marks lost jobs partial instead of inventing results.
- HTTP errors, WAF responses and unknown results stay unavailable. Sherlock's
  site heuristics are weaker than identity-confirmed public APIs; matches are
  low-confidence possible matches with source URLs, never shared-identity proof.
- Usage counts complete scan start attempts, not each underlying website
  request. External site allowances and reset times remain unknown. Consult the
  Cloudflare dashboard for infrastructure billing.

## Security and storage

The browser cannot specify site URLs, flags, proxies, commands or subsets. The
service accepts a strict username and an application-generated job ID. Sherlock
runs through argument-array subprocess APIs as an unprivileged user, with a
fixed bundled catalog. Requests and redirects require HTTPS/public DNS targets;
actual socket resolution rejects private addresses. Response bodies are capped
at 2 MiB. Response HTML, credentials and subprocess stderr are not retained in
results. Metadata is transient in the container; saved findings live in the
user's existing D1 investigation.

`TRACELET_TEST_PROXY=1` is exclusively for this managed workspace's trusted
egress proxy and is not configured in the deployed container. The Docker build
accepts an optional BuildKit `build_ca` secret for a development TLS proxy; this
CA is not copied into the runtime image.

## Catalog provenance and maintenance

`service/catalog.json` is Sherlock's MIT-licensed public site manifest at commit
`c588d7c8b476df9f9c84912a05d1430fb8cdcdae`. `service/exclusions.txt` is the official
exclusion list fetched on 2026-11-14. The upstream MIT license is included in
`LICENSE-Sherlock`. Review upstream changes and individual site terms before
updating/enabling entries. No paid APIs or sensitive profile inference are used.

## Validation

```sh
python -m pip install -r cloudflare/sherlock/requirements.txt pytest httpx
PYTHONPATH=cloudflare/sherlock pytest cloudflare/sherlock/tests -q
cd cloudflare && npm test
```

Unit tests cover malformed inputs, non-public destination protections,
blocked/error response classification, personal budgets, private service
binding, progress, idempotency, busy rejection and cancellation. Live validation
uses public test handles; it does not establish every site's reliability.
Cloudflare-hosted execution still requires a post-upgrade live check; local
tests are not represented as a successful cloud deployment.
