import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
if (!existsSync(".dev.vars"))
  writeFileSync(
    ".dev.vars",
    `ENCRYPTION_KEY=${randomBytes(32).toString("base64")}\n`,
    { mode: 0o600, flag: "wx" },
  );
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "wrangler.dev.jsonc",
    "--local",
    "--port",
    "8787",
  ],
  { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("exit", (code) => process.exit(code ?? 0));
