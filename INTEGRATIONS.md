# Integrations and enablement review

Registry declarations live in `backend/app/registry.py` and `cloudflare/src/registry.ts`. Installed does not mean validated. Enabled means implemented in this version; actual external availability is recorded by requests and tests, not guaranteed forever.

| Integration | Hosted | Local | Requirements / terms |
|---|---|---|---|
| Username discovery (29 platforms) | Implemented | Implemented | Public APIs; exact handle confirmation; possible matches only |
| DNS | Implemented | Implemented | Official Google Public DNS HTTPS API; Google's service/privacy terms apply |
| RDAP | Implemented | Implemented | IANA bootstrap + registry endpoint (hosted); RDAP.org bootstrap (local); registry-specific data restrictions |
| libphonenumber | Implemented | Implemented | JS MIT wrapper / Apache-2.0 metadata; Python port Apache-2.0; offline data |
| Image metadata | Browser exifr | Browser exifr + backend Pillow | exifr MIT; Pillow HPND; untrusted metadata |
| PDF properties | Browser pdf-lib | Browser pdf-lib + backend pypdf | MIT / BSD-3-Clause; no scripts/macros executed |
| ExifTool | Unavailable | Disabled pending native validation | Artistic/GPL dual terms; native executable installation |
| Sherlock | Container adapter prepared; account plan blocks deployment | Disabled pending native integration | MIT; see [Cloudflare setup](cloudflare/sherlock/README.md) |
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
