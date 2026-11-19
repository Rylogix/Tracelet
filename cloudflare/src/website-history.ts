import { external, finding, type ProviderEnv } from "./providers";

const archive = "https://web.archive.org";
const crt = "https://crt.sh";
type RecordValue = Record<string, unknown>;
const asRecord = (item: unknown): RecordValue => item && typeof item === "object" ? item as RecordValue : {};

function captureTime(timestamp: string) {
  return timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6Z");
}

export async function websiteHistory(env: ProviderEnv, owner: string, domain: string) {
  const homepage = "https://" + domain + "/";
  const timeline = archive + "/web/*/" + homepage;
  const query = new URLSearchParams({
    url: domain + "/", output: "json", fl: "timestamp", filter: "statuscode:200", collapse: "timestamp:6",
  });
  const data: unknown = await external(env, owner, "wayback", archive + "/cdx/search/cdx?" + query, {},
    { timeout: 5000, maxBytes: 65536 });
  if (!Array.isArray(data) || (data.length && data[0]?.[0] !== "timestamp"))
    throw new Error("Wayback Machine returned an unexpected response.");
  const timestamps = data.slice(1).map(row => {
    const timestamp: unknown = Array.isArray(row) ? row[0] : undefined;
    if (typeof timestamp !== "string" || !/^\d{14}$/.test(timestamp))
      throw new Error("Wayback Machine returned an invalid capture timestamp.");
    return timestamp;
  }).sort();
  if (!timestamps.length)
    return [finding("Wayback Machine", "No archived homepage captures returned", "No successful homepage captures appeared in this Wayback Machine query.", timeline)];

  const oldest = timestamps[0];
  const newest = timestamps[timestamps.length - 1];
  const capture = (timestamp: string, title: string) => finding("Wayback Machine", title, {
    domain,
    captured_at: captureTime(timestamp),
    more_captures: timeline,
    scope: "One successful capture per month. The full timeline may contain newer or additional captures.",
  }, archive + "/web/" + timestamp + "/" + homepage);
  return oldest === newest ? [capture(oldest, "Archived homepage capture")] :
    [capture(oldest, "Earliest archived homepage capture"), capture(newest, "Most recent sampled homepage capture")];
}

export async function certificateHistory(env: ProviderEnv, owner: string, domain: string) {
  const query = new URLSearchParams({ q: domain, output: "json" });
  const data: unknown = await external(env, owner, "certificate-transparency", crt + "/?" + query, {},
    { timeout: 5000, maxBytes: 512 * 1024 });
  if (!Array.isArray(data)) throw new Error("crt.sh returned an unexpected response.");

  const seen = new Set<string>();
  const records = data.map(asRecord).sort((a, b) => String(b.not_before ?? "").localeCompare(String(a.not_before ?? "")));
  const results = [];
  for (const row of records) {
    if (!Number.isSafeInteger(row.id) || typeof row.issuer_name !== "string" ||
        typeof row.serial_number !== "string" || typeof row.name_value !== "string" ||
        typeof row.not_before !== "string" || typeof row.not_after !== "string") {
      throw new Error("crt.sh returned an invalid certificate record.");
    }
    const names = [...new Set(row.name_value.toLowerCase().split(/\s+/).filter(name => {
      if (!/^(?:\*\.)?[a-z0-9.-]+$/.test(name)) return false;
      return name === domain || name.endsWith("." + domain);
    }))];
    if (!names.length) continue;
    const key = row.issuer_name + "|" + row.serial_number;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(finding("crt.sh", "Logged certificate · " + row.not_before.slice(0, 10), {
      issuer: row.issuer_name,
      valid_from: row.not_before,
      valid_until: row.not_after,
      certificate_names: names.slice(0, 12),
      scope: "Certificate names are historical observations and may no longer resolve.",
    }, crt + "/?id=" + row.id));
    if (results.length === 5) break;
  }
  return results.length ? results : [finding("crt.sh", "No matching certificates returned",
    "This query did not return matching certificate names.", crt + "/?q=" + encodeURIComponent(domain))];
}
