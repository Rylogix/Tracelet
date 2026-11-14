#!/usr/bin/env python3
"""Cross-platform local launcher. Run with Python 3.11+; no env editing needed."""

import os
import platform
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import venv
import webbrowser

os.environ["NEXT_TELEMETRY_DISABLED"] = "1"
ROOT = Path(__file__).resolve().parent.parent


def run(args, cwd=ROOT):
    subprocess.run(args, cwd=cwd, check=True)


def main():
    print("Tracelet • local setup • " + platform.system(), flush=True)
    if sys.version_info < (3, 11):
        sys.exit(
            "Install Python 3.11 or newer from https://python.org/downloads/ and run again."
        )
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node")
    if not npm or not node:
        sys.exit(
            "Install Node.js 22 LTS from https://nodejs.org/ and restart this launcher. Docker Compose is an alternative: see docs/SETUP.md."
        )
    major = int(
        subprocess.check_output([node, "--version"], text=True)
        .strip()
        .lstrip("v")
        .split(".")[0]
    )
    if major < 22:
        sys.exit(
            "Node.js 22 or newer is required. Install it from https://nodejs.org/."
        )
    for port in [3000, 8000]:
        with socket.socket() as check:
            if check.connect_ex(("127.0.0.1", port)) == 0:
                sys.exit(
                    f"Port {port} is in use. Stop the existing service before launching Tracelet."
                )
    env_dir = ROOT / ".venv"
    if not env_dir.exists():
        venv.create(env_dir, with_pip=True)
    python = env_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    run([str(python), "-m", "pip", "install", "-r", "backend/requirements.txt"])
    run([npm, "ci"], ROOT / "frontend")
    run([npm, "run", "build"], ROOT / "frontend")
    environment = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "backend"),
        "TRACELET_DATA": str(ROOT / "data"),
    }
    processes = []
    try:
        processes.append(
            subprocess.Popen(
                [
                    str(python),
                    "-m",
                    "uvicorn",
                    "app.main:app",
                    "--host",
                    "127.0.0.1",
                    "--port",
                    "8000",
                    "--no-access-log",
                ],
                cwd=ROOT,
                env=environment,
            )
        )
        processes.append(
            subprocess.Popen(
                [
                    npm,
                    "exec",
                    "next",
                    "start",
                    "--",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    "3000",
                ],
                cwd=ROOT / "frontend",
                env=environment,
            )
        )
        for _ in range(120):
            if any(p.poll() is not None for p in processes):
                raise RuntimeError("A service stopped. Review the error above.")
            try:
                urllib.request.urlopen(
                    "http://127.0.0.1:3000/api/health", timeout=2
                ).close()
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError("Startup timed out. Review the service logs above.")
        print(
            "Tracelet is ready: http://127.0.0.1:3000 • Press Ctrl+C to stop.",
            flush=True,
        )
        webbrowser.open("http://127.0.0.1:3000")
        while all(p.poll() is None for p in processes):
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        for p in processes:
            if p.poll() is None:
                p.terminate()
        for p in processes:
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, RuntimeError) as exc:
        sys.exit("Setup stopped: " + str(exc))
