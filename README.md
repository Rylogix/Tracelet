# Tracelet

A free, open-source OSINT workspace for public information, with real sources and transparent API usage. Matte charcoal Next.js interface with white controls and responsive mobile navigation.

**Two deployment modes:** a public-signup Cloudflare website at your own domain, or a private local installation. The hosted edition is live at **https://tracelet.rylogix.com**.

## What works

- Automatic username / email / phone / domain input detection.
- Public GitHub profile lookup, DNS-over-HTTPS, RDAP domain registration, and offline phone validation.
- Browser-only image metadata, PDF properties, file size and SHA-256 analysis. No hosted uploads.
- Background searches, live progress, cancellation, source links, timestamps, confidence labels and JSON exports.
- Opt-in history, private investigation storage, API-key encryption, manual connect/disconnect/test controls.
- API usage dashboard with atomic counters, provider headers when present, honest unknown values, retry-after cooldowns and personal budgets.
- GitHub footprint proof of control via public bio challenge, opt-in daily monitoring and in-app change alerts.
- Cloudflare: public passkey signup/login, HttpOnly sessions and account-isolated D1 storage. No paid authentication service required.
- Local: Python/FastAPI, SQLite, auto-generated encryption key, Windows/macOS/Linux launchers and Docker Compose.

**Limits:** broad Sherlock/Maigret/ExifTool execution remains disabled pending live compatibility validation. Account verification supports GitHub only. Monitoring checks profile metadata, not arbitrary people or content. Video and office documents receive file properties/hash only. VirusTotal needs your own key and has not been tested against a live personal key in this workspace. No sensitive-person profiling, account enumeration, active security scanning, or paid adapters are implemented.

## Run as a Cloudflare website

See [Cloudflare deployment](docs/CLOUDFLARE.md). Uses Workers static assets + Workers API + D1; no Python server or mandatory paid API. Public signup uses passkeys. The operator must control `rylogix.com` in the chosen Cloudflare account to attach `tracelet.rylogix.com`.

Cloudflare platform quotas still apply. A public service cannot promise unlimited free capacity. The hosted edition stores account data in Cloudflare, rather than on each visitor's local disk. File contents stay in the browser.

## Run on your computer

Download and extract the source ZIP. Install **Python 3.11+** and **Node.js 22+** once.

- **Windows:** double-click `launch.cmd`.
- **macOS/Linux:** run `sh launch.sh` from the extracted folder.
- **Docker alternative:** install Docker with Compose, run `docker compose up --build`, then open http://localhost:3000.

The launcher checks dependencies and ports, installs project dependencies, builds the frontend, initializes the database and encryption key, starts both services on localhost, and opens your browser. Normal setup needs no environment-file editing. First-run dependency downloads require internet access. Use Ctrl+C to stop. Full instructions: [Setup](docs/SETUP.md).

## Development and tests

```sh
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/pytest backend/tests -q
cd frontend
npm ci
npm run build
npx playwright install chromium
# Start the backend in another terminal first:
# PYTHONPATH=backend .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
npm run test:e2e
```

Cloudflare-specific checks and browser authentication tests are documented in [VALIDATION.md](docs/VALIDATION.md). Test fixtures never appear as application results.

## Project documents

[Specification](SPEC.md) · [Architecture](ARCHITECTURE.md) · [Integrations](INTEGRATIONS.md) · [API limits](API_LIMITS.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [Release packaging](docs/RELEASING.md)

MIT licensed. Third-party tools and provider data retain their own licenses and terms.

### Public username discovery

Username searches check 29 public platforms concurrently and show only confirmed public profiles as possible matches. Expand Checks to see missing profiles, blocked requests and unavailable sources. Choose Username to search a dotted handle instead of a domain. See [INTEGRATIONS.md](INTEGRATIONS.md) for exact coverage.
