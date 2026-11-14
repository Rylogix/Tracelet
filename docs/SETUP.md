# Local installation

## Windows 10/11

Install Python 3.11+ from python.org (enable the PATH option) and Node.js 22+ from nodejs.org. Download/extract the repository ZIP and double-click `launch.cmd`. If SmartScreen or enterprise policy blocks scripts, use a terminal in the extracted folder and run `py -3 scripts\launch.py`. The script reports missing dependencies and leaves errors visible.

## macOS / Linux

Install Python 3.11+ and Node.js 22+ using their official installers or your trusted package manager. In the extracted directory run `sh launch.sh`. Linux distributions may require their `python3-venv` package. The script does not run privileged package-manager commands automatically.

## Docker

Install Docker Desktop (Windows/macOS) or Docker Engine with Compose (Linux). Review Docker Desktop's applicable licensing terms for your organization. Run `docker compose up --build` from the project directory and open http://localhost:3000. No normal environment editing is required. Only loopback port 3000 is published. `docker compose down` stops services; data persists in the named volume. `docker compose down -v` permanently deletes all local Tracelet data and keys.

## First run

The launcher creates a virtual environment, installs Python and npm dependencies from pinned manifests/lockfiles, builds Next, starts the loopback API/UI, creates SQLite tables/migration versions and a local encryption key, and opens a browser. Review history privacy in the first-run wizard. Available keyless modules are detected automatically. Native optional tools remain disabled pending validation.

Provider key setup is in Settings → Integrations. Paste your own key, connect and test; never paste it into a GitHub issue or commit. Test Connection consumes a real request. Open a provider’s usage badge on its lookup page for the last successful request and local budget.

Stop with Ctrl+C. Restart with the same launcher. The current launcher performs install/build checks each time; it favors reproducibility over fastest repeated startup. A network connection is needed to initially download dependencies and to perform public lookups. Offline phone and file analysis can work after installation.

## Supported/tested status

Linux is tested in the development environment. Windows/macOS launch paths are implemented but not yet native-device certified. Native OS secret-store integration and signed installer binaries remain future work. For a web-only public service, use the separate Cloudflare mode instead.
