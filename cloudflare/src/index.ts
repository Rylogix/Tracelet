import { auth, owner as identify, json, type AuthEnv } from "./auth";
import { detect, domain, encrypt, githubHandle } from "./security";
import { registry } from "./registry";
import { adapter, external, type ProviderEnv, type Finding } from "./providers";
interface Env extends AuthEnv, ProviderEnv {
  ASSETS: Fetcher;
}
type Job = {
  id: string;
  query: string;
  target: string;
  kind: string;
  status: string;
  created: string;
  history: boolean;
  findings: Finding[];
  errors: { source: string; message: string }[];
  notes: string[];
  unavailable: { name: string; reason: string }[];
  completed: number;
  total: number;
};
const stamp = () => new Date().toISOString();
async function integrations(env: Env, owner: string) {
  const credentials = await env.DB.prepare(
    "SELECT provider FROM credentials WHERE owner=?",
  )
    .bind(owner)
    .all<{ provider: string }>();
  const connected = new Set(credentials.results.map((r) => r.provider));
  const health = await env.DB.prepare(
    "SELECT provider FROM usage WHERE owner=? AND last_success IS NOT NULL",
  )
    .bind(owner)
    .all<{ provider: string }>();
  const tested = new Set(health.results.map((r) => r.provider));
  return registry.map((i) => {
    const available =
      !("restricted" in i && i.restricted) &&
      (!i.credential || (connected.has(i.id) && tested.has(i.id)));
    return {
      ...i,
      available,
      installed: !("restricted" in i && i.restricted),
      connected: i.credential ? connected.has(i.id) : true,
      status: available
        ? "Available"
        : "restricted" in i && i.restricted
          ? "Unavailable in hosted edition"
          : connected.has(i.id)
            ? "Connection test required"
            : "API key required",
      quota_reporting:
        i.rate === null
          ? "No external request quota"
          : "Provider headers when available; otherwise unknown",
      timeout_seconds: 25,
      cancellation: "Cooperative between providers",
      output: "Normalized findings with sources and timestamps",
    };
  });
}
async function persist(env: Env, owner: string, job: Job) {
  await env.DB.prepare(
    "UPDATE jobs SET status=?,payload=?,updated=? WHERE id=? AND owner=? AND status!=?",
  )
    .bind(
      job.status,
      JSON.stringify(job),
      Date.now(),
      job.id,
      owner,
      "cancelled",
    )
    .run();
}
async function runJob(env: Env, owner: string, job: Job) {
  job.status = "running";
  await persist(env, owner, job);
  const items = await integrations(env, owner);
  const compatible = items.filter((i) =>
    (i.kinds as readonly string[]).includes(job.kind),
  );
  const runnable = compatible.filter((i) => i.available);
  job.total = runnable.length;
  job.unavailable = compatible
    .filter((i) => !i.available)
    .map((i) => ({ name: i.name, reason: i.status }));
  await persist(env, owner, job);
  for (const integration of runnable) {
    const current = await env.DB.prepare(
      "SELECT status FROM jobs WHERE id=? AND owner=?",
    )
      .bind(job.id, owner)
      .first<{ status: string }>();
    if (!current || current.status === "cancelled") return;
    try {
      job.findings.push(
        ...(await adapter(env, owner, integration.id, job.target, job.kind)),
      );
    } catch (error) {
      job.errors.push({
        source: integration.name,
        message: (error as Error).message,
      });
    }
    job.completed++;
    await persist(env, owner, job);
  }
  job.status = job.errors.length ? "partial" : "completed";
  await persist(env, owner, job);
}
async function routes(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  owner: string,
  path: string,
): Promise<Response> {
  const method = request.method;
  if (path === "/api/health")
    return json({
      status: "ok",
      version: "0.1.0",
      storage: "Cloudflare D1, isolated by account",
      hosted: true,
    });
  if (path === "/api/setup") {
    if (method === "POST") {
      const body = (await request.json()) as { history: boolean };
      await env.DB.prepare(
        "INSERT INTO settings VALUES(?,?,1) ON CONFLICT(owner) DO UPDATE SET history=?,complete=1",
      )
        .bind(owner, body.history ? 1 : 0, body.history ? 1 : 0)
        .run();
      return json({ ok: true });
    }
    const settings = await env.DB.prepare(
      "SELECT * FROM settings WHERE owner=?",
    )
      .bind(owner)
      .first<{ complete: number; history: number }>();
    return json({
      complete: !!settings?.complete,
      history: !!settings?.history,
      hosted: true,
      os: "Cloudflare Workers",
      retention_days: 30,
      integrations: await integrations(env, owner),
    });
  }
  if (path === "/api/integrations") return json(await integrations(env, owner));
  const keyMatch = path.match(/^\/api\/integrations\/([^/]+)\/(key|test)$/);
  if (keyMatch) {
    const provider = keyMatch[1];
    if (!["virustotal", "abuseipdb"].includes(provider))
      return json({ detail: "Unknown credential provider" }, 404);
    if (keyMatch[2] === "test") {
      if (method !== "POST" || provider !== "virustotal")
        return json({ detail: "Connection test unavailable" }, 400);
      try {
        await adapter(env, owner, provider, "example.com", "website");
        return json({ ok: true });
      } catch (e) {
        return json({ detail: (e as Error).message }, 400);
      }
    }
    if (method === "DELETE") {
      await env.DB.prepare(
        "DELETE FROM credentials WHERE owner=? AND provider=?",
      )
        .bind(owner, provider)
        .run();
      return json({ connected: false });
    }
    if (method === "PUT") {
      if (!env.ENCRYPTION_KEY)
        return json(
          { detail: "The deployment encryption secret is not configured." },
          503,
        );
      const body = (await request.json()) as { key: string };
      if (
        typeof body.key !== "string" ||
        !body.key.trim() ||
        body.key.length > 4096
      )
        return json({ detail: "Invalid API key" }, 422);
      await env.DB.prepare("INSERT OR REPLACE INTO credentials VALUES(?,?,?)")
        .bind(owner, provider, await encrypt(body.key, env.ENCRYPTION_KEY))
        .run();
      await env.DB.prepare(
        "UPDATE usage SET last_success=NULL WHERE owner=? AND provider=?",
      )
        .bind(owner, provider)
        .run();
      return json({ connected: true, masked: "••••••••" });
    }
  }
  if (path === "/api/usage") {
    const rows = await env.DB.prepare("SELECT * FROM usage WHERE owner=?")
      .bind(owner)
      .all<Record<string, any>>();
    const configs = await env.DB.prepare(
      "SELECT thresholds FROM quota_alert_settings WHERE owner=?",
    )
      .bind(owner)
      .first<{ thresholds: string }>();
    const thresholds: number[] = JSON.parse(
      configs?.thresholds || "[50,80,90,100]",
    );
    return json(
      (await integrations(env, owner))
        .filter((i) => i.rate !== null)
        .map((i) => {
          const r = rows.results.find((r) => r.provider === i.id) || {
            attempts: 0,
            successes: 0,
            failures: 0,
            quota_limit: null,
            remaining: null,
            reset: null,
            last_update: null,
            last_success: null,
            budget: null,
            blocked_until: 0,
            confirmed: 0,
          };
          const percent =
            r.quota_limit && r.remaining !== null
              ? ((r.quota_limit - r.remaining) / r.quota_limit) * 100
              : null;
          const { owner: ignored, ...safe } = r;
          return {
            ...safe,
            blocked_until: (r.blocked_until || 0) / 1000,
            provider: i.id,
            name: i.name,
            available: i.available,
            unit: "requests",
            reset_frequency: "unknown",
            source: r.confirmed
              ? "provider headers (keyless limits may share Cloudflare egress IP)"
              : "local attempts; provider allowance unknown",
            percentage: percent,
            safety_limit_per_minute: i.rate,
            alerts: thresholds.filter((t) => percent !== null && percent >= t),
          };
        }),
    );
  }
  const budget = path.match(/^\/api\/usage\/([^/]+)\/budget$/);
  if (budget && method === "PUT") {
    const provider = budget[1];
    const body = (await request.json()) as { requests: number | null };
    if (
      !registry.some((i) => i.id === provider && i.rate) ||
      (body.requests !== null &&
        (!Number.isInteger(body.requests) ||
          body.requests < 0 ||
          body.requests > 1000000))
    )
      return json({ detail: "Invalid budget" }, 422);
    await env.DB.prepare(
      "INSERT INTO usage(owner,provider,budget) VALUES(?,?,?) ON CONFLICT(owner,provider) DO UPDATE SET budget=?",
    )
      .bind(owner, provider, body.requests, body.requests)
      .run();
    return json({ ok: true });
  }
  if (path === "/api/usage/alerts" && method === "GET") {
    const config = await env.DB.prepare(
      "SELECT thresholds FROM quota_alert_settings WHERE owner=?",
    )
      .bind(owner)
      .first<{ thresholds: string }>();
    return json({
      thresholds: JSON.parse(config?.thresholds || "[50,80,90,100]"),
    });
  }
  if (path === "/api/usage/alerts" && method === "PUT") {
    const body = (await request.json()) as { thresholds: number[] };
    if (
      !Array.isArray(body.thresholds) ||
      body.thresholds.some((n) => ![50, 80, 90, 100].includes(n))
    )
      return json({ detail: "Choose 50, 80, 90, and/or 100 percent." }, 422);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO quota_alert_settings VALUES(?,?)",
    )
      .bind(owner, JSON.stringify([...new Set(body.thresholds)]))
      .run();
    return json({ ok: true });
  }
  if (path === "/api/search" && method === "POST") {
    const body = (await request.json()) as { query: string; history: boolean };
    if (
      typeof body.query !== "string" ||
      !body.query.trim() ||
      body.query.length > 253
    )
      return json({ detail: "Enter a search up to 253 characters." }, 422);
    const query = body.query.trim();
    let kind: string, target: string;
    try {
      kind = detect(query);
      target = ["website", "email"].includes(kind)
        ? domain(kind === "email" ? query.split("@")[1] : query)
        : query;
    } catch (e) {
      return json({ detail: (e as Error).message }, 422);
    }
    const searchBucket =
      "search:" + owner + ":" + Math.floor(Date.now() / 60000);
    const requestCount = await env.DB.prepare(
      "INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
    )
      .bind(searchBucket, Date.now() + 120000)
      .first<{ count: number }>();
    if ((requestCount?.count ?? 0) > 5)
      return json(
        { detail: "Search limit reached. Wait a minute before trying again." },
        429,
      );
    const active = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM jobs WHERE owner=? AND ((status IN ('queued','running') AND updated>?) OR created>?)",
    )
      .bind(
        owner,
        Date.now() - 60000,
        new Date(Date.now() - 60000).toISOString(),
      )
      .first<{ count: number }>();
    if ((active?.count || 0) >= 5)
      return json(
        { detail: "Search limit reached. Wait a minute before trying again." },
        429,
      );
    const cache = await env.DB.prepare(
      "SELECT payload FROM jobs WHERE owner=? AND query=? AND status='completed' AND updated>? LIMIT 1",
    )
      .bind(owner, query, Date.now() - 300000)
      .first<{ payload: string }>();
    if (cache) {
      const cached = JSON.parse(cache.payload) as Job;
      if (body.history === true && !cached.history) {
        cached.history = true;
        await env.DB.prepare(
          "UPDATE jobs SET history=1,expires=?,payload=? WHERE id=? AND owner=?",
        )
          .bind(
            Date.now() + 30 * 86400000,
            JSON.stringify(cached),
            cached.id,
            owner,
          )
          .run();
      }
      return json({ ...cached, cached: true }, 202);
    }
    const job: Job = {
      id: crypto.randomUUID(),
      query,
      target,
      kind,
      status: "queued",
      created: stamp(),
      history: body.history === true,
      findings: [],
      errors: [],
      notes:
        kind === "email"
          ? [
              "Only public domain mail configuration is inspected. No mailbox existence or account exposure is inferred.",
            ]
          : kind === "username"
            ? [
                "GitHub public profiles only. Matching usernames do not establish shared identity.",
              ]
            : [],
      unavailable: [],
      completed: 0,
      total: 0,
    };
    await env.DB.prepare("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(
        job.id,
        owner,
        query,
        kind,
        job.status,
        job.created,
        Date.now(),
        Date.now() + (job.history ? 30 * 86400000 : 3600000),
        job.history ? 1 : 0,
        JSON.stringify(job),
      )
      .run();
    ctx.waitUntil(runJob(env, owner, job));
    return json(job, 202);
  }
  const search = path.match(/^\/api\/search\/([^/]+)(\/cancel)?$/);
  if (search) {
    const row = await env.DB.prepare(
      "SELECT payload,status,updated FROM jobs WHERE id=? AND owner=? AND expires>?",
    )
      .bind(search[1], owner, Date.now())
      .first<{ payload: string; status: string; updated: number }>();
    if (!row) return json({ detail: "Search not found" }, 404);
    const job = JSON.parse(row.payload) as Job;
    if (search[2] && method === "POST") {
      job.status = "cancelled";
      await env.DB.prepare(
        "UPDATE jobs SET status='cancelled',payload=? WHERE id=? AND owner=?",
      )
        .bind(JSON.stringify(job), job.id, owner)
        .run();
    } else if (
      ["queued", "running"].includes(row.status) &&
      Date.now() - row.updated > 60000
    ) {
      job.status = "interrupted";
      await persist(env, owner, job);
    }
    return json(job);
  }
  if (path === "/api/history") {
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM jobs WHERE owner=? AND history=1")
        .bind(owner)
        .run();
      return json({ ok: true });
    }
    return json(
      (
        await env.DB.prepare(
          "SELECT id,query,kind,status,created FROM jobs WHERE owner=? AND history=1 AND expires>? ORDER BY created DESC LIMIT 100",
        )
          .bind(owner, Date.now())
          .all()
      ).results,
    );
  }
  if (path === "/api/files")
    return json(
      {
        detail:
          "Hosted files must be analyzed in the browser. No file upload endpoint is enabled.",
      },
      400,
    );
  if (path === "/api/footprint") {
    if (method === "POST") {
      const body = (await request.json()) as { username: string; url: string };
      if (
        typeof body.username !== "string" ||
        body.username.length < 1 ||
        body.username.length > 80 ||
        typeof body.url !== "string" ||
        body.url.length > 500
      )
        return json(
          { detail: "Enter a username and public profile URL." },
          422,
        );
      try {
        domain(body.url);
      } catch {
        return json({ detail: "Public profile URL required" }, 422);
      }
      const item = {
        id: crypto.randomUUID(),
        url: body.url.includes("://") ? body.url : "https://" + body.url,
        username: body.username,
        status: "unverified",
        created: stamp(),
      };
      await env.DB.prepare(
        "INSERT INTO footprint(id,owner,url,username,status,created) VALUES(?,?,?,?,?,?)",
      )
        .bind(
          item.id,
          owner,
          item.url,
          item.username,
          item.status,
          item.created,
        )
        .run();
      return json(item);
    }
    return json(
      (
        await env.DB.prepare(
          "SELECT id,url,username,status,created,challenge,monitoring,interval_hours,last_scan FROM footprint WHERE owner=? ORDER BY created DESC",
        )
          .bind(owner)
          .all()
      ).results,
    );
  }
  const profile = path.match(
    /^\/api\/footprint\/([^/]+)(?:\/(challenge|verify|monitoring))?$/,
  );
  if (profile) {
    const row = await env.DB.prepare(
      "SELECT * FROM footprint WHERE id=? AND owner=?",
    )
      .bind(profile[1], owner)
      .first<Record<string, any>>();
    if (!row) return json({ detail: "Profile not found" }, 404);
    if (!profile[2] && method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM footprint WHERE id=? AND owner=?").bind(
          profile[1],
          owner,
        ),
        env.DB.prepare(
          "DELETE FROM alerts WHERE profile_id=? AND owner=?",
        ).bind(profile[1], owner),
      ]);
      return json({ ok: true });
    }
    const handle = githubHandle(row.url);
    if (!handle)
      return json(
        {
          detail:
            "Ownership verification currently supports GitHub profile URLs only.",
        },
        400,
      );
    if (profile[2] === "challenge" && method === "POST") {
      const token = "tracelet-verify-" + crypto.randomUUID();
      await env.DB.prepare(
        "UPDATE footprint SET challenge=?,status='unverified',monitoring=0 WHERE id=? AND owner=?",
      )
        .bind(token, row.id, owner)
        .run();
      return json({
        challenge: token,
        instructions:
          "Temporarily add this token to your public GitHub bio, then click Verify.",
      });
    }
    if (profile[2] === "verify" && method === "POST") {
      if (!row.challenge)
        return json({ detail: "Generate a challenge first." }, 400);
      try {
        const data = await external(
          env,
          owner,
          "github",
          "https://api.github.com/users/" + encodeURIComponent(handle),
          { Accept: "application/vnd.github+json" },
        );
        if (!data.bio?.includes(row.challenge))
          return json(
            {
              detail:
                "Verification token was not found in the public profile bio.",
            },
            400,
          );
        await env.DB.prepare(
          "UPDATE footprint SET status='verified',snapshot=?,last_scan=? WHERE id=? AND owner=?",
        )
          .bind(JSON.stringify(profileSnapshot(data)), stamp(), row.id, owner)
          .run();
        return json({ verified: true });
      } catch (e) {
        return json({ detail: (e as Error).message }, 400);
      }
    }
    if (profile[2] === "monitoring" && method === "PUT") {
      const body = (await request.json()) as {
        enabled: boolean;
        interval_hours?: number;
      };
      if (row.status !== "verified")
        return json(
          { detail: "Verify ownership before enabling monitoring." },
          400,
        );
      const hours = body.interval_hours ?? 24;
      if (!Number.isInteger(hours) || hours < 24 || hours > 8760)
        return json({ detail: "Choose an interval of 24–8760 hours." }, 422);
      await env.DB.prepare(
        "UPDATE footprint SET monitoring=?,interval_hours=? WHERE id=? AND owner=?",
      )
        .bind(body.enabled ? 1 : 0, hours, row.id, owner)
        .run();
      return json({ ok: true });
    }
  }
  if (path === "/api/alerts") {
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM alerts WHERE owner=?")
        .bind(owner)
        .run();
      return json({ ok: true });
    }
    return json(
      (
        await env.DB.prepare(
          "SELECT id,profile_id,created,message FROM alerts WHERE owner=? ORDER BY created DESC LIMIT 100",
        )
          .bind(owner)
          .all()
      ).results,
    );
  }
  if (path === "/api/account" && method === "DELETE") {
    await env.DB.batch(
      [
        "settings",
        "jobs",
        "credentials",
        "usage",
        "footprint",
        "alerts",
        "quota_alert_settings",
        "passkeys",
        "sessions",
      ]
        .map((table) =>
          env.DB.prepare(`DELETE FROM ${table} WHERE owner=?`).bind(owner),
        )
        .concat([
          env.DB.prepare("DELETE FROM accounts WHERE id=?").bind(owner),
        ]),
    );
    return json({ ok: true }, 200, {
      "Set-Cookie":
        "tracelet_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
    });
  }
  return json({ detail: "Endpoint not found" }, 404);
}
function profileSnapshot(data: Record<string, unknown>) {
  return Object.fromEntries(
    ["login", "bio", "name", "blog", "public_repos"].map((k) => [
      k,
      data[k] ?? null,
    ]),
  );
}
const worker = {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (!["GET", "HEAD"].includes(request.method)) {
      if (Number(request.headers.get("content-length")) > 16384)
        return json({ detail: "Request too large" }, 413);
      if (request.body) {
        const reader = request.body.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > 16384) {
            await reader.cancel();
            return json({ detail: "Request too large" }, 413);
          }
          chunks.push(part.value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const part of chunks) {
          body.set(part, offset);
          offset += part.length;
        }
        request = new Request(request, { body });
      }
    }
    const response = await worker.handle(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    if (env.APP_ORIGIN.startsWith("https://"))
      headers.set("Strict-Transport-Security", "max-age=31536000");
    return new Response(response.body, { status: response.status, headers });
  },
  async handle(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
      const origin = request.headers.get("origin");
      if (origin && origin !== env.APP_ORIGIN)
        return json({ detail: "Cross-origin access denied" }, 403);
      if (
        !["GET", "HEAD"].includes(request.method) &&
        request.headers.get("x-tracelet-client") !== "local-ui"
      )
        return json({ detail: "Client header required" }, 403);
      if (Number(request.headers.get("content-length")) > 16384)
        return json({ detail: "Request too large" }, 413);
      if (path.startsWith("/api/auth/")) return await auth(request, env, path);
      const owner = await identify(request, env);
      if (!owner)
        return json({ detail: "Sign in to use your private workspace." }, 401);
      return await routes(request, env, ctx, owner, path);
    } catch (error) {
      return json(
        {
          detail:
            error instanceof SyntaxError
              ? "Invalid request body."
              : "Request could not be completed. No credentials are included in error logs.",
        },
        500,
      );
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM jobs WHERE expires<?").bind(Date.now()),
      env.DB.prepare("DELETE FROM sessions WHERE expires<?").bind(Date.now()),
      env.DB.prepare("DELETE FROM challenges WHERE expires<?").bind(Date.now()),
      env.DB.prepare("DELETE FROM auth_limits WHERE expires<?").bind(
        Date.now(),
      ),
    ]);
    const profiles = await env.DB.prepare(
      "SELECT * FROM footprint WHERE monitoring=1 AND status='verified' AND (last_scan IS NULL OR julianday('now')-julianday(last_scan)>=interval_hours/24.0) ORDER BY last_scan LIMIT 10",
    ).all<Record<string, any>>();
    for (const profile of profiles.results) {
      const handle = githubHandle(profile.url);
      if (!handle) continue;
      try {
        const data = await external(
          env,
          profile.owner,
          "github",
          "https://api.github.com/users/" + encodeURIComponent(handle),
          { Accept: "application/vnd.github+json" },
        );
        const snapshot = JSON.stringify(profileSnapshot(data));
        if (profile.snapshot && profile.snapshot !== snapshot)
          await env.DB.prepare("INSERT INTO alerts VALUES(?,?,?,?,?)")
            .bind(
              crypto.randomUUID(),
              profile.owner,
              profile.id,
              stamp(),
              "Your verified public GitHub profile changed. Review your account directly.",
            )
            .run();
        await env.DB.prepare(
          "UPDATE footprint SET snapshot=?,last_scan=? WHERE id=? AND owner=?",
        )
          .bind(snapshot, stamp(), profile.id, profile.owner)
          .run();
      } catch {
        /* Availability and quotas govern the next scheduled attempt. */
      }
    }
  },
};

export default worker;
