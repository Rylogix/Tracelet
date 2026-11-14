# Integrations and enablement review

Registry declarations live in `backend/app/registry.py` and `cloudflare/src/registry.ts`. Installed does not mean validated. Enabled means implemented in this version; actual external availability is recorded by requests and tests, not guaranteed forever.

| Integration | Hosted | Local | Requirements / terms |
|---|---|---|---|
| GitHub public profiles | Implemented | Implemented | Official public REST endpoint; GitHub API terms; low-confidence handle match |
| DNS | Implemented | Implemented | Official Google Public DNS HTTPS API; Google's service/privacy terms apply |
| RDAP | Implemented | Implemented | IANA bootstrap + registry endpoint (hosted); RDAP.org bootstrap (local); registry-specific data restrictions |
| libphonenumber | Implemented | Implemented | JS MIT wrapper / Apache-2.0 metadata; Python port Apache-2.0; offline data |
| Image metadata | Browser exifr | Browser exifr + backend Pillow | exifr MIT; Pillow HPND; untrusted metadata |
| PDF properties | Browser pdf-lib | Browser pdf-lib + backend pypdf | MIT / BSD-3-Clause; no scripts/macros executed |
| ExifTool | Unavailable | Disabled pending native validation | Artistic/GPL dual terms; native executable installation |
| Sherlock | Unavailable | Disabled pending compatibility tests | MIT; site-specific terms and output format review required |
| Maigret | Unavailable | Disabled pending compatibility tests | MIT; broad enumeration must be carefully scoped |
| VirusTotal | Optional personal key | Optional personal key | Domain endpoint implemented; live credential validation pending; official free-tier rules apply |
| AbuseIPDB | Disabled candidate | Disabled candidate | Official registration link only; no untested requests |

All external adapters have timeouts, cooperative cancellation, safety limits and normalized evidence. Native tools are not automatically installed by the default launcher because they are not yet validated adapters. The launcher installs and validates the runtime dependencies needed by enabled modules. Do not advertise optional tools as operational merely because an executable exists.

## Candidate backlog — disabled

WhatsMyName, Blackbird, Socialscan, Holehe, GHunt, h8mail, PhoneInfoga, theHarvester, Subfinder, Amass, DNSRecon, SpiderFoot, Apache Tika, FFprobe, Tesseract, ImageHash, WhatWeb, httpx, Katana, crt.sh, SEC EDGAR, GLEIF, urlscan.io, Cytoscape.js and NetworkX.

No license or current maintenance claim is made for backlog entries. Review upstream license at the exact version, last release/maintenance, official endpoint/data terms, credential requirements, actual rate limits, subprocess/network risk, supported OS and live tests before activation. Account-existence enumeration and sensitive profiling are outside the allowed product behavior even if a candidate tool supports them.
