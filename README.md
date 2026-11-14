# Tracelet

A free, open-source OSINT workspace for public information, with real sources and transparent API usage. Matte charcoal Next.js interface with white controls and responsive mobile navigation.

**Two deployment modes:** a public-signup Cloudflare website at your own domain, or a private local installation. The hosted edition is live at **https://tracelet.rylogix.com**.

## What works

- Dashboard → Username, Email, Number, Files, Website → Report workflow. Each search stays in its source tab and adds its own removable report panel.
- Public username checks across 29 platforms with available bios, websites, dates and public counts. Expanded DNS, readable RDAP registration, public ASN/prefix mapping, email-domain authentication policies and offline number details.
- Browser-only image metadata, PDF properties/page dimensions, Office/OpenDocument metadata, file size and SHA-256 analysis. No hosted uploads.
- Streaming findings with subtle entry animations and reduced-motion support; cancellation, source links, timestamps and confidence labels. Editable report titles, PDF/TXT downloads and clipboard copy.
- Private report drafts autosave across tabs and reloads. Save to history & clear archives only the selected panels and starts a fresh workspace. API-key encryption and optional integration controls remain available.
- Lookup-page usage badges with atomic counters, provider headers when present, honest unknown values, retry-after cooldowns and personal budgets.
- Cloudflare: public passkey signup/login, HttpOnly sessions and account-isolated D1 storage. No paid authentication service required.
- Local: Python/FastAPI, SQLite, auto-generated encryption key, Windows/macOS/Linux launchers and Docker Compose.

**Limits:** optional Sherlock container deployment requires paid infrastructure and remains disabled in the free Cloudflare configuration. Maigret/ExifTool remain disabled. Video and office documents receive file properties/hash only. VirusTotal requires your own key; personal-key live validation remains pending. No sensitive-person profiling, account enumeration or active security scans.

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

### Designed PDF reports

PDF exports include a coal cover, actual search/finding/source totals, category coverage, a clickable search index, dedicated search sections, labeled nested-evidence tables, source URLs, confidence and observation times, availability notes, source-check outcomes and a linked evidence register. Long observations paginate instead of being truncated. A UTF-8 text attachment preserves the complete original selected report. Rendering is local to the browser; no third-party PDF service receives your data.

### Homepage and sign-in

Signed-out visitors see a short introduction at `/`, with Get started / Sign in leading to `/login`. Existing hosted sessions skip the public pages and open `/dashboard`. Signing out returns to the introduction. Other workspace pages require a session; the private local edition continues straight to its dashboard.
