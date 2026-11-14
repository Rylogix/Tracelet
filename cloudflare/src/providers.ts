import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { decrypt, githubHandle } from "./security";
export interface ProviderEnv {
  DB: D1Database;
  ENCRYPTION_KEY: string;
}
export type Finding = {
  source: string;
  title: string;
  value: unknown;
  evidence?: string;
  confidence: string;
  observed_at: string;
};
export const finding = (
  source: string,
  title: string,
  value: unknown,
  evidence?: string,
  confidence = "high",
): Finding => ({
  source,
  title,
  value,
  evidence,
  confidence,
  observed_at: new Date().toISOString(),
});
const intervals: Record<string, number> = {
  dns: 2000,
  rdap: 6000,
  github: 6000,
  virustotal: 15000,
};
export async function external(
  env: ProviderEnv,
  owner: string,
  provider: string,
  url: string,
  headers: Record<string, string> = {},
): Promise<any> {
  const time = Date.now();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO usage(owner,provider) VALUES(?,?)",
  )
    .bind(owner, provider)
    .run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO provider_locks(provider) VALUES(?)",
  )
    .bind(provider)
    .run();
  const locked = await env.DB.prepare(
    "UPDATE provider_locks SET next_request=? WHERE provider=? AND next_request<=? RETURNING provider",
  )
    .bind(time + (intervals[provider] || 6000), provider, time)
    .first();
  if (!locked)
    throw new Error("Provider safety limit reached. Try again shortly.");
  const reservation = await env.DB.prepare(
    "UPDATE usage SET attempts=attempts+1,last_update=? WHERE owner=? AND provider=? AND (budget IS NULL OR attempts<budget) AND blocked_until<=? AND (remaining IS NULL OR remaining>0 OR (reset IS NOT NULL AND reset<=?)) RETURNING attempts",
  )
    .bind(
      new Date().toISOString(),
      owner,
      provider,
      time,
      new Date().toISOString(),
    )
    .first();
  if (!reservation)
    throw new Error(
      "Provider is exhausted, cooling down, or at your personal budget.",
    );
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "Tracelet/0.1 (public-information research)",
        ...headers,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    await env.DB.prepare(
      "UPDATE usage SET failures=failures+1 WHERE owner=? AND provider=?",
    )
      .bind(owner, provider)
      .run();
    throw new Error("Provider network request failed.");
  }
  const stamp = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE usage SET successes=successes+?,failures=failures+?,last_success=CASE WHEN ? THEN ? ELSE last_success END WHERE owner=? AND provider=?",
  )
    .bind(
      response.ok ? 1 : 0,
      response.ok ? 0 : 1,
      response.ok ? 1 : 0,
      stamp,
      owner,
      provider,
    )
    .run();
  for (const [field, names] of [
    ["quota_limit", ["x-ratelimit-limit", "ratelimit-limit"]],
    ["remaining", ["x-ratelimit-remaining", "ratelimit-remaining"]],
  ] as const) {
    for (const name of names) {
      const value = response.headers.get(name);
      if (value !== null && /^\d+$/.test(value)) {
        await env.DB.prepare(
          `UPDATE usage SET ${field}=?,confirmed=1 WHERE owner=? AND provider=?`,
        )
          .bind(Number(value), owner, provider)
          .run();
        break;
      }
    }
  }
  const reset = response.headers.get("x-ratelimit-reset");
  if (
    reset &&
    /^\d+$/.test(reset) &&
    Number.isFinite(Number(reset)) &&
    Number(reset) < 1e12
  )
    await env.DB.prepare(
      "UPDATE usage SET reset=? WHERE owner=? AND provider=?",
    )
      .bind(new Date(Number(reset) * 1000).toISOString(), owner, provider)
      .run();
  if (response.status === 429) {
    const retry = response.headers.get("retry-after") || "60";
    const seconds = /^\d+$/.test(retry)
      ? Number(retry)
      : Math.max(1, (Date.parse(retry) - time) / 1000) || 60;
    await env.DB.prepare(
      "UPDATE usage SET blocked_until=? WHERE owner=? AND provider=?",
    )
      .bind(time + Math.min(86400, seconds) * 1000, owner, provider)
      .run();
  }
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "No public record was returned (HTTP 404)."
        : response.status === 429
          ? "Provider rate limit reached."
          : "Provider returned an error; check credentials or try later.",
    );
  if (Number(response.headers.get("content-length")) > 2 * 1024 * 1024)
    throw new Error("Provider response exceeded the size limit.");
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!reader) throw new Error("Empty provider response");
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 2 * 1024 * 1024) {
      await reader.cancel();
      throw new Error("Provider response exceeded the size limit.");
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Provider returned an unsupported response.");
  }
}
let bootstrap: { expires: number; services: [string[], string[]][] } | null =
  null;
async function rdapEndpoint(target: string): Promise<string> {
  if (!bootstrap || bootstrap.expires < Date.now()) {
    const response = await fetch("https://data.iana.org/rdap/dns.json", {
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });
    if (!response.ok) throw new Error("IANA RDAP bootstrap unavailable.");
    const data = (await response.json()) as {
      services: [string[], string[]][];
    };
    bootstrap = { expires: Date.now() + 86400000, services: data.services };
  }
  const tld = target.split(".").at(-1)!;
  const service = bootstrap.services.find(([tlds]) => tlds.includes(tld));
  const base = service?.[1].find((v) => v.startsWith("https://"));
  if (!base)
    throw new Error(
      "No supported HTTPS RDAP registry was listed for this domain.",
    );
  return new URL(
    "domain/" + encodeURIComponent(target),
    base.endsWith("/") ? base : base + "/",
  ).href;
}
export async function adapter(
  env: ProviderEnv,
  owner: string,
  provider: string,
  target: string,
  kind: string,
): Promise<Finding[]> {
  if (provider === "phone") {
    const phone = parsePhoneNumberFromString(target);
    if (!phone)
      throw new Error(
        "Include an international country code, for example +44.",
      );
    return [
      finding("libphonenumber", "Number format", {
        international: phone.formatInternational(),
        valid: phone.isValid(),
        possible: phone.isPossible(),
        country: phone.country ?? "Unknown",
        type: phone.getType() ?? "Unknown",
        note: "Offline numbering-plan data. Does not identify a subscriber or prove that a number is assigned.",
      }),
    ];
  }
  if (provider === "github") {
    if (!githubHandle("https://github.com/" + target))
      throw new Error("This handle does not match GitHub username syntax.");
    const data = await external(
      env,
      owner,
      "github",
      "https://api.github.com/users/" + encodeURIComponent(target),
      { Accept: "application/vnd.github+json" },
    );
    return [
      finding(
        "GitHub",
        "Public profile (possible username match)",
        Object.fromEntries(
          [
            "login",
            "name",
            "bio",
            "blog",
            "public_repos",
            "created_at",
            "updated_at",
          ].map((k) => [k, data[k] ?? null]),
        ),
        data.html_url,
        "low",
      ),
    ];
  }
  if (provider === "dns") {
    const results: Finding[] = [];
    for (const [i, type] of ["A", "AAAA", "MX", "NS", "TXT"].entries()) {
      if (i) await new Promise((r) => setTimeout(r, 2050));
      const url =
        "https://dns.google/resolve?name=" +
        encodeURIComponent(target) +
        "&type=" +
        type;
      const data = await external(env, owner, provider, url);
      if (![0, 3].includes(data.Status))
        throw new Error("Public DNS resolver could not answer this query.");
      results.push(
        finding(
          "Google Public DNS",
          type + " records",
          data.Answer?.map((a: { data: string }) => a.data) ?? [],
          "https://dns.google/query?name=" +
            encodeURIComponent(target) +
            "&type=" +
            type,
        ),
      );
    }
    return results;
  }
  if (provider === "rdap") {
    const url = await rdapEndpoint(target);
    const data = await external(env, owner, provider, url);
    return [
      finding(
        "RDAP",
        "Domain registration",
        Object.fromEntries(
          ["ldhName", "status", "events", "nameservers", "entities"].map(
            (k) => [k, data[k] ?? null],
          ),
        ),
        url,
      ),
    ];
  }
  if (provider === "virustotal") {
    const stored = await env.DB.prepare(
      "SELECT encrypted FROM credentials WHERE owner=? AND provider=?",
    )
      .bind(owner, provider)
      .first<{ encrypted: string }>();
    if (!stored) throw new Error("Personal API key required.");
    const key = await decrypt(stored.encrypted, env.ENCRYPTION_KEY);
    const data = await external(
      env,
      owner,
      provider,
      "https://www.virustotal.com/api/v3/domains/" + encodeURIComponent(target),
      { "x-apikey": key },
    );
    const attrs = data.data?.attributes ?? {};
    return [
      finding(
        "VirusTotal",
        "Domain reputation",
        Object.fromEntries(
          ["last_analysis_stats", "reputation", "last_analysis_date"].map(
            (k) => [k, attrs[k] ?? null],
          ),
        ),
        "https://www.virustotal.com/gui/domain/" + encodeURIComponent(target),
      ),
    ];
  }
  return [];
}
