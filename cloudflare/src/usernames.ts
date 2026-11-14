import rawPlatforms from "../../backend/app/username_platforms.json";
import {
  external,
  finding,
  ProviderError,
  type Finding,
  type ProviderEnv,
} from "./providers";
export interface Platform {
  id: string;
  name: string;
  endpoint: string;
  url: string;
  identity: string;
  claimed: string;
  docs: string;
  license: string;
  timeout_ms: number;
  safety_per_minute: number;
  display?: string;
  collection?: string;
  id_path?: string;
  method?: string;
  body?: unknown;
  missing_path?: string;
  missing_values?: unknown[];
  null_missing?: boolean;
  normalize_spaces?: boolean;
}
export const platforms = rawPlatforms as Platform[];
export interface ProfileCheck {
  platform: string;
  provider: string;
  status: "found" | "not_found" | "unavailable" | "skipped";
  url?: string;
  reason?: string;
  cached?: boolean;
  finding?: Finding;
}
export function field(data: any, path: string): any {
  return path ? path.split(".").reduce((v, key) => v?.[key], data) : data;
}
function normalize(value: string, site: Platform) {
  return (
    site.normalize_spaces ? value.replaceAll("_", " ") : value
  ).toLowerCase();
}
function values(site: Platform, target: string) {
  return {
    username: target,
    handle: target.includes(".") ? target : target + ".bsky.social",
  };
}
function format(
  template: string,
  replace: Record<string, string>,
  encode = true,
) {
  return template.replace(/\{(username|handle|id)\}/g, (_, key) =>
    encode ? encodeURIComponent(replace[key] || "") : replace[key] || "",
  );
}
export function interpret(
  site: Platform,
  target: string,
  status: number,
  data: any,
): ProfileCheck {
  const base = { platform: site.name, provider: site.id };
  const v = values(site, target);
  if(site.id === "opencollective" && Array.isArray(data?.errors)&&data.errors.length)return {...base,status:"unavailable",reason:"Provider error"};
  if (
    status === 404 ||
    (site.null_missing && data === null) ||
    (site.missing_path &&
      site.missing_values?.some((value) =>
        Object.is(field(data, site.missing_path!), value),
      ))
  )
    return { ...base, status: "not_found" };
  if (status !== 200)
    return {
      ...base,
      status: "unavailable",
      reason:
        status === 429
          ? "Rate limited"
          : status === 403
            ? "Blocked"
            : "HTTP " + status,
    };
  const expected = site.id === "bluesky" ? v.handle : target;
  let account = data;
  if (site.collection !== undefined) {
    const list = field(data, site.collection);
    if (!Array.isArray(list))
      return { ...base, status: "unavailable", reason: "Unexpected response" };
    if (!list.length) return { ...base, status: "not_found" };
    account = list.find(
      (item) =>
        typeof field(item, site.identity) === "string" &&
        normalize(field(item, site.identity), site) ===
          normalize(expected, site),
    );
  }
  const identity = field(account, site.identity);
  if (
    typeof identity !== "string" ||
    normalize(identity, site) !== normalize(expected, site)
  )
    return { ...base, status: "unavailable", reason: "Profile not confirmed" };
  const rawId = site.id_path ? field(account, site.id_path) : "";
  if (site.id_path && !/^\d+$/.test(String(rawId)))
    return { ...base, status: "unavailable", reason: "Invalid profile ID" };
  const url = format(site.url, { ...v, id: String(rawId) });
  const display = site.display ? field(account, site.display) : null;
  return {
    ...base,
    status: "found",
    url,
    finding: finding(
      site.name,
      "@" + identity,
      {
        username: identity,
        ...(typeof display === "string" && display.trim()
          ? { name: display.trim().slice(0, 200) }
          : {}),
      },
      url,
      "low",
    ),
  };
}
export async function checkProfile(
  env: ProviderEnv,
  owner: string,
  site: Platform,
  target: string,
): Promise<ProfileCheck> {
  const base = { platform: site.name, provider: site.id };
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(target))
    return {
      ...base,
      status: "skipped",
      reason: "Unsupported username format",
    };
  const cached = await env.DB.prepare(
    "SELECT payload FROM provider_cache WHERE owner=? AND provider=? AND query=? AND expires>?",
  )
    .bind(owner, site.id, target, Date.now())
    .first<{ payload: string }>();
  if (cached) return { ...JSON.parse(cached.payload), cached: true };
  try {
    const v = values(site, target);
    const body =
      site.body === undefined
        ? undefined
        : JSON.parse(format(JSON.stringify(site.body), v, false));
    const result = await external(
      env,
      owner,
      site.id,
      format(site.endpoint, v),
      { Accept: "application/json" },
      {
        method: site.method,
        body,
        envelope: true,
        allowedStatuses: [400, 404],
        timeout: site.timeout_ms,
        maxBytes: 1024 * 1024,
      },
    );
    const check = interpret(site, target, result.status, result.data);
    if (check.status === "found" || check.status === "not_found")
      await env.DB.prepare(
        "INSERT OR REPLACE INTO provider_cache VALUES(?,?,?,?,?)",
      )
        .bind(
          owner,
          site.id,
          target,
          JSON.stringify(check),
          Date.now() + 300000,
        )
        .run();
    return check;
  } catch (error) {
    const status = error instanceof ProviderError ? error.status : 0;
    return {
      ...base,
      status: "unavailable",
      reason:
        status === 403
          ? "Blocked"
          : status === 429
            ? "Rate limited"
            : (error as Error).message.includes("budget")
              ? "Budget or quota limit"
              : (error as Error).message.includes("safety limit")
                ? "Safety rate limit"
                : "Request failed",
    };
  }
}
export async function scanProfiles(
  env: ProviderEnv,
  owner: string,
  target: string,
  onCheck: (check: ProfileCheck) => Promise<void>,
  cancelled: () => Promise<boolean>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (cursor < platforms.length) {
        if (await cancelled()) return;
        const site = platforms[cursor++];
        if (!site) return;
        await onCheck(await checkProfile(env, owner, site, target));
      }
    }),
  );
}
