# Integrations and enablement review

Registry declarations live in `backend/app/registry.py` and `cloudflare/src/registry.ts`. Installed does not mean validated. Enabled means implemented in this version; actual external availability is recorded by requests and tests, not guaranteed forever.

| Integration | Hosted | Local | Requirements / terms |
|---|---|---|---|
| Username discovery (29 platforms) | Implemented | Implemented | Public APIs; exact handle confirmation; possible matches only |
| DNS | Implemented | Implemented | Google Public DNS HTTPS API; A, AAAA, CNAME, MX, NS, TXT, CAA, SOA; TTL and DNSSEC validation flags |
| Email domain policies | Implemented | Implemented | SPF/DMARC, MTA-STS and TLS reporting DNS records; shared DNS budget; no mailbox/account enumeration |
| Public network | Implemented | Implemented | Team Cymru public IP-to-ASN DNS service via Google DNS; one public IPv4 sample, routing prefix, registry and ASN name |
| RDAP | Implemented | Implemented | IANA bootstrap + registry endpoint (hosted); RDAP.org bootstrap (local); registry-specific data restrictions |
| Have I Been Pwned | Public breach catalog by exact Website domain | — | Keyless. Verified public service-level records; no individual account lookup. [API documentation](https://haveibeenpwned.com/API/v3#AllBreaches) |
| Wayback Machine | Homepage history | — | Public availability API. Returns a recent capture and links to the full timeline. |
| Cert Spotter | Certificate Transparency history | — | Shows up to five unexpired certificates and related names and links to the full crt.sh history. |
| libphonenumber | Implemented | Implemented | JS MIT wrapper / Apache-2.0 metadata; Python port Apache-2.0; offline data |
| Image metadata | Browser exifr | Browser exifr + backend Pillow | exifr MIT; Pillow HPND; untrusted metadata |
| PDF properties | Browser pdf-lib | Browser pdf-lib + backend pypdf | MIT / BSD-3-Clause; title, author, dates, page sizes/rotations; no scripts/macros executed |
| Office/OpenDocument metadata | Browser fflate | Browser fflate | MIT; bounded ZIP metadata extraction only; macros and document contents are not executed |
| ExifTool | Unavailable | Disabled pending native validation | Artistic/GPL dual terms; native executable installation |
| Sherlock | Container adapter prepared; account plan blocks deployment | Disabled pending native integration | MIT; see [Cloudflare setup](../cloudflare/sherlock/README.md) |
| Maigret | Unavailable | Disabled pending compatibility tests | MIT; broad enumeration must be carefully scoped |
| VirusTotal | Optional personal key | Optional personal key | Domain endpoint implemented; live credential validation pending; official free-tier rules apply |
| AbuseIPDB | Disabled candidate | Disabled candidate | Official registration link only; no untested requests |

All external adapters have timeouts, cooperative cancellation, safety limits and normalized evidence. Native tools are not automatically installed by the default launcher because they are not yet validated adapters. The launcher installs and validates the runtime dependencies needed by enabled modules. Do not advertise optional tools as operational merely because an executable exists.

## Candidate backlog — disabled

WhatsMyName, Blackbird, Socialscan, Holehe, GHunt, h8mail, PhoneInfoga, theHarvester, Subfinder, Amass, DNSRecon, SpiderFoot, Apache Tika, FFprobe, Tesseract, ImageHash, WhatWeb, httpx, Katana, crt.sh, SEC EDGAR, GLEIF, urlscan.io, Cytoscape.js and NetworkX.

No license or current maintenance claim is made for backlog entries. Review upstream license at the exact version, last release/maintenance, official endpoint/data terms, credential requirements, actual rate limits, subprocess/network risk, supported OS and live tests before activation. Account-existence enumeration and sensitive profiling are outside the allowed product behavior even if a candidate tool supports them.

## Username discovery

The shared catalog in `backend/app/username_platforms.json` declares endpoints, official documentation, terms, response identity fields, timeouts and safety rates. Platforms: GitHub, GitLab, Codeberg, Gitea, DEV, Docker Hub, Hugging Face, Bluesky, Mastodon.social, Infosec.exchange, Pixelfed.social, Chess.com, Lichess, Hacker News, Keybase, Scratch, Trello, Discourse Meta, Cloudflare Community, Python Discourse, freeCodeCamp, Hugo, Modrinth, Stack Overflow, Wikipedia, Lemmy.world, Framatube, Roblox and Open Collective. Federated services check the named instance only.

Six checks run concurrently. Only exact public API identities produce findings. Missing profiles, blocked requests, rate limits and malformed responses are distinct states. Results are cached privately for five minutes; cancellation prevents new checks and in-flight calls have four-second timeouts. All matches are possible matches, never identity proof. Sherlock has an optional private Cloudflare Container adapter; deployment requires Workers Paid and is currently disabled. Maigret remains unavailable. MIT attribution for Sherlock test references is included in `backend/app/third-party/`.

## Richer observations

Public username response fields are explicitly allowlisted in the shared catalog: bios, declared websites, creation dates, public activity totals, reputation and platform badges where returned. Missing fields stay missing; no extra profile requests or contact dumps are made. Profile bios are bounded to 1,600 characters and all handle matches remain low-confidence possible matches. Phone results expose numbering-plan facts, not subscriber identity, live carrier or assignment status.

RDAP presents registrar name/ID, registration/expiration/change dates, nameservers and signed-delegation status without displaying registrant contact cards. Network routing uses only an already-resolved public IPv4 and Team Cymru's documented DNS names; it is not physical geolocation or proof of website ownership. RIPEstat was evaluated but not enabled because its redistribution terms do not fit exported reports.

DNS records stream individually. Eligible answers respect positive/negative DNS TTLs, capped at five minutes. Hosted website/email tasks have a 24-second orchestration budget with checkpoints and cooperative cancellation; time-limited tasks retain actual observations and report omitted checks as unavailable. Browser document parsing allows only exact metadata paths, caps extracted XML at 256 KiB per entry, processes compressed input in small chunks and does not expand XML entities or access external resources. The existing 10 MiB upload and 12-second worker limits remain.
