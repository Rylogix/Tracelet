export function detect(value: string): string {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
  if (/^\+?[\d ()-]{7,25}$/.test(value)) return "phone";
  if (value.includes(".") || value.includes("://")) return "website";
  if (/^[A-Za-z0-9_.-]{1,80}$/.test(value)) return "username";
  throw new Error(
    "Enter a username, email, international phone number, or public domain.",
  );
}
export function domain(value: string): string {
  const url = new URL(value.includes("://") ? value : "https://" + value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("Use a public domain without credentials or custom ports.");
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      host,
    ) ||
    /(^|\.)(localhost|local|internal|test|invalid|lan|home|onion)$/.test(host)
  )
    throw new Error("Private and internal network targets are not supported.");
  return host;
}
export function githubHandle(value: string): string | null {
  try {
    const url = new URL(value);
    const handle = url.pathname.replace(/^\/|\/$/g, "");
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.search &&
      !url.hash &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle)
      ? handle
      : null;
  } catch {
    return null;
  }
}
export async function encrypt(secret: string, key: string): Promise<string> {
  const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  if (raw.length !== 32)
    throw new Error("Encryption key must contain 32 bytes.");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      new TextEncoder().encode(secret),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...ciphertext));
}
export async function decrypt(secret: string, key: string): Promise<string> {
  const data = Uint8Array.from(atob(secret), (c) => c.charCodeAt(0));
  const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    raw,
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: data.slice(0, 12) },
      cryptoKey,
      data.slice(12),
    ),
  );
}
