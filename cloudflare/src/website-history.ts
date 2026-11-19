import { external, finding, type ProviderEnv } from "./providers";

type RecordValue = Record<string, unknown>;
const asRecord = (item: unknown): RecordValue => item && typeof item === "object" ? item as RecordValue : {};

export async function websiteHistory(env: ProviderEnv, owner: string, domain: string) {
  const archive = "https://web.archive.org";
  const homepage = "https://" + domain + "/";
  const timeline = archive + "/web/*/" + homepage;
  const query = new URLSearchParams({ url: domain });
  const data: unknown = await external(env, owner, "wayback", "https://archive.org/wayback/available?" + query, {},
    { timeout: 5000, maxBytes: 65536 });
  const snapshots = asRecord(data).archived_snapshots;
  if (!snapshots || typeof snapshots !== "object" || Array.isArray(snapshots))
    throw new Error("Wayback Machine returned an unexpected response.");

  const closest = asRecord(snapshots).closest;
  if (closest === undefined)
    return [finding("Wayback Machine", "No archived homepage captures returned",
      "The Wayback Machine did not return a homepage capture for this domain.", timeline)];
  const { timestamp, available, url } = asRecord(closest);
  if (available !== true || typeof timestamp !== "string" || !/^\d{14}$/.test(timestamp) || typeof url !== "string")
    throw new Error("Wayback Machine returned an invalid capture.");
  const match = url.match(/^https?:\/\/web\.archive\.org\/web\/(\d{14})\/(https?:\/\/.+)$/);
  if (!match || match[1] !== timestamp)
    throw new Error("Wayback Machine returned an invalid capture link.");
  const original = new URL(match[2]);
  if (original.username || original.password || ![domain, "www." + domain].includes(original.hostname))
    throw new Error("Wayback Machine returned a capture for a different address.");

  const capturedAt = timestamp.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1-$2-$3T$4:$5:$6Z");
  return [finding("Wayback Machine", "Recent archived homepage capture", {
    domain,
    captured_at: capturedAt,
    more_captures: timeline,
  }, archive + "/web/" + timestamp + "/" + original.href)];
}

export async function certificateHistory(env: ProviderEnv, owner: string, domain: string) {
  const history = "https://crt.sh/?q=" + encodeURIComponent(domain);
  const query = new URLSearchParams({ domain, include_subdomains: "true" });
  query.append("expand", "dns_names");
  query.append("expand", "issuer");
  const data: unknown = await external(env, owner, "certificate-transparency",
    "https://api.certspotter.com/v1/issuances?" + query, {}, { timeout: 5000, maxBytes: 512 * 1024 });
  if (!Array.isArray(data)) throw new Error("Cert Spotter returned an unexpected response.");

  const records = data.map(asRecord).sort((a, b) => String(b.not_before ?? "").localeCompare(String(a.not_before ?? "")));
  const results = [];
  for (const row of records) {
    if (typeof row.id !== "string" || !/^\d+$/.test(row.id) || !Array.isArray(row.dns_names) ||
        typeof row.not_before !== "string" || typeof row.not_after !== "string")
      throw new Error("Cert Spotter returned an invalid certificate record.");

    const names = [...new Set(row.dns_names.flatMap((value: unknown) => {
      if (typeof value !== "string") return [];
      const name = value.toLowerCase();
      return /^(?:\*\.)?[a-z0-9.-]+$/.test(name) && (name === domain || name.endsWith("." + domain)) ? [name] : [];
    }))];
    if (!names.length) continue;
    const issuer = asRecord(row.issuer);
    results.push(finding("Cert Spotter", "Logged certificate · " + row.not_before.slice(0, 10), {
      issuer: issuer.friendly_name ?? issuer.name,
      valid_from: row.not_before,
      valid_until: row.not_after,
      certificate_names: names.slice(0, 12),
      full_history: history,
      scope: "Cert Spotter returns unexpired records. Certificate names may no longer resolve.",
    }, "https://api.certspotter.com/v1/issuances/" + row.id + "?expand=dns_names&expand=issuer"));
    if (results.length === 5) break;
  }
  return results.length ? results : [finding("Cert Spotter", "No matching unexpired certificates returned",
    "Older certificates may appear in the full Certificate Transparency history.", history)];
}
