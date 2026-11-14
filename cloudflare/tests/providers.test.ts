import { beforeAll, afterAll, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync } from "node:fs";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { adapter, external } from "../src/providers";
let mf: Miniflare;
let db: D1Database;
beforeAll(async () => {
  setGlobalDispatcher(new EnvHttpProxyAgent());
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("ok")}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-11-14",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  for(const file of ["0001_initial.sql","0002_username_discovery.sql"]){
    for(const statement of readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8").split(";").map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
  }
  await db
    .prepare("INSERT INTO accounts VALUES(?,?,?)")
    .bind("a", "alice", new Date().toISOString())
    .run();
  await db
    .prepare("INSERT INTO accounts VALUES(?,?,?)")
    .bind("b", "bob", new Date().toISOString())
    .run();
});
afterAll(async () => {
  await mf?.dispose();
});
it("atomically enforces zero budget without network calls", async () => {
  await db
    .prepare("INSERT INTO usage(owner,provider,budget) VALUES(?,?,?)")
    .bind("a", "rdap", 0)
    .run();
  await expect(
    external(
      { DB: db, ENCRYPTION_KEY: "" },
      "a",
      "rdap",
      "https://rdap.org/domain/example.com",
    ),
  ).rejects.toThrow("budget");
  expect(
    (
      await db
        .prepare("SELECT attempts FROM usage WHERE owner=? AND provider=?")
        .bind("a", "rdap")
        .first<{ attempts: number }>()
    )?.attempts,
  ).toBe(0);
  expect(await db.prepare("SELECT * FROM provider_locks WHERE provider='rdap'").first()).toBeNull();
});
it("prevents orphan account writes", async () => {
  await expect(
    db
      .prepare("INSERT INTO credentials VALUES(?,?,?)")
      .bind("missing", "virustotal", "encrypted")
      .run(),
  ).rejects.toThrow();
});
it("keeps quotas unknown before requests", async () => {
  await db
    .prepare("INSERT INTO usage(owner,provider) VALUES(?,?)")
    .bind("b", "github")
    .run();
  const row = await db
    .prepare("SELECT * FROM usage WHERE owner=? AND provider=?")
    .bind("b", "github")
    .first();
  expect(row?.quota_limit).toBeNull();
  expect(row?.remaining).toBeNull();
  expect(row?.reset).toBeNull();
});
it.skipIf(process.env.TRACELET_LIVE !== "1")(
  "runs real DNS, RDAP and GitHub adapters with D1 accounting",
  async () => {
    const env = { DB: db, ENCRYPTION_KEY: "" };
    const dns = await adapter(env, "b", "dns", "example.com", "website");
    expect(dns.length).toBe(8);
    expect(
      dns.some(
        (f) =>
          f.title === "A records" &&
          Array.isArray((f.value as any).answers) &&
          (f.value as any).answers.length > 0,
      ),
    ).toBe(true);
    const rdap = await adapter(env, "b", "rdap", "example.com", "website");
    expect((rdap[0].value as { domain: string }).domain.toLowerCase()).toBe(
      "example.com",
    );
    const network=await adapter(env,"b","network","example.com","website");
    expect((network[0].value as any).routes.length).toBeGreaterThan(0);
    const mail=await adapter(env,"b","email-security","gmail.com","email");
    expect(mail.some(f=>f.title==="SPF & DMARC" && (f.value as any).dmarc_records.length>0)).toBe(true);
    const github = await adapter(env, "b", "github", "octocat", "username");
    expect((github[0].value as { login: string }).login.toLowerCase()).toBe(
      "octocat",
    );
    const row = await db
      .prepare("SELECT * FROM usage WHERE owner=? AND provider=?")
      .bind("b", "github")
      .first();
    expect(row?.attempts).toBe(1);
    expect(row?.successes).toBe(1);
    expect(row?.confirmed).toBe(1);
  },
  60000,
);

it("accounts for failed requests and provider-confirmed exhaustion", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("{}", {
      status: 429,
      headers: {
        "x-ratelimit-limit": "100",
        "x-ratelimit-remaining": "0",
        "retry-after": "120",
      },
    });
  try {
    await expect(
      external(
        { DB: db, ENCRYPTION_KEY: "" },
        "a",
        "virustotal",
        "https://www.virustotal.com/api/v3/domains/example.com",
      ),
    ).rejects.toThrow("rate limit");
    const row = await db
      .prepare("SELECT * FROM usage WHERE owner=? AND provider=?")
      .bind("a", "virustotal")
      .first();
    expect(row?.attempts).toBe(1);
    expect(row?.failures).toBe(1);
    expect(row?.successes).toBe(0);
    expect(row?.remaining).toBe(0);
    expect(Number(row?.blocked_until)).toBeGreaterThan(Date.now());
  } finally {
    globalThis.fetch = original;
  }
});
