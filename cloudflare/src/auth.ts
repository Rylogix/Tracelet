import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
export interface AuthEnv {
  DB: D1Database;
  APP_ORIGIN: string;
  ENVIRONMENT: string;
}
export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export async function owner(
  request: Request,
  env: AuthEnv,
): Promise<string | null> {
  const token = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)tracelet_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (!token) return null;
  return (
    (
      await env.DB.prepare(
        "SELECT owner FROM sessions WHERE hash=? AND expires>?",
      )
        .bind(await hash(token), Date.now())
        .first<{ owner: string }>()
    )?.owner ?? null
  );
}
async function newSession(env: AuthEnv, id: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)")
    .bind(await hash(token), id, Date.now() + 30 * 86400000)
    .run();
  return `tracelet_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${env.APP_ORIGIN.startsWith("https://") ? "; Secure" : ""}`;
}
export async function auth(
  request: Request,
  env: AuthEnv,
  path: string,
): Promise<Response> {
  const origin = new URL(env.APP_ORIGIN);
  const rpID = origin.hostname;
  if (path === "/api/auth/me") {
    const id = await owner(request, env);
    const account = id
      ? await env.DB.prepare("SELECT username FROM accounts WHERE id=?")
          .bind(id)
          .first()
      : null;
    return json({
      authenticated: !!account,
      username: account?.username ?? null,
      hosted: true,
    });
  }
  if (request.method !== "POST")
    return json({ detail: "Method not allowed" }, 405);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const bucket = await hash(ip + ":" + Math.floor(Date.now() / 60000));
  const rate = await env.DB.prepare(
    "INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(bucket, Date.now() + 120000)
    .first<{ count: number }>();
  if ((rate?.count ?? 0) > 15)
    return json(
      { detail: "Too many authentication attempts. Try again in a minute." },
      429,
    );
  const body = (await request.json()) as {
    username?: string;
    challengeId?: string;
    response?: RegistrationResponseJSON | AuthenticationResponseJSON;
  };
  if (path === "/api/auth/logout") {
    const token = request.headers
      .get("cookie")
      ?.match(/tracelet_session=([a-f0-9]{64})/)?.[1];
    if (token)
      await env.DB.prepare("DELETE FROM sessions WHERE hash=?")
        .bind(await hash(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": `tracelet_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${origin.protocol === "https:" ? "; Secure" : ""}`,
    });
  }
  if (path === "/api/auth/register/options") {
    const username = (body.username || "").trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(username))
      return json(
        {
          detail:
            "Choose a username with 3–32 letters, numbers, underscores, or hyphens.",
        },
        422,
      );
    if (
      await env.DB.prepare("SELECT id FROM accounts WHERE username=?")
        .bind(username)
        .first()
    )
      return json({ detail: "Choose a different username." }, 409);
    const options = await generateRegistrationOptions({
      rpName: "Tracelet",
      rpID,
      userName: username,
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
    const challengeId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO challenges VALUES(?,?,?,?,?)")
      .bind(
        challengeId,
        options.challenge,
        "register",
        username,
        Date.now() + 300000,
      )
      .run();
    return json({ options, challengeId });
  }
  if (path === "/api/auth/login/options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    const challengeId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO challenges VALUES(?,?,?,?,?)")
      .bind(challengeId, options.challenge, "login", null, Date.now() + 300000)
      .run();
    return json({ options, challengeId });
  }
  if (path.endsWith("/verify")) {
    if (!body.challengeId || !body.response)
      return json({ detail: "Missing passkey response" }, 422);
    const challenge = await env.DB.prepare(
      "DELETE FROM challenges WHERE id=? AND expires>? RETURNING *",
    )
      .bind(body.challengeId, Date.now())
      .first<{ challenge: string; kind: string; username: string }>();
    if (!challenge)
      return json({ detail: "Challenge expired. Try again." }, 400);
    try {
      if (
        path === "/api/auth/register/verify" &&
        challenge.kind === "register"
      ) {
        const result = await verifyRegistrationResponse({
          response: body.response as RegistrationResponseJSON,
          expectedChallenge: challenge.challenge,
          expectedOrigin: origin.origin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo)
          throw new Error("Verification failed");
        const id = crypto.randomUUID();
        const credential = result.registrationInfo.credential;
        await env.DB.batch([
          env.DB.prepare("INSERT INTO accounts VALUES(?,?,?)").bind(
            id,
            challenge.username,
            new Date().toISOString(),
          ),
          env.DB.prepare("INSERT INTO passkeys VALUES(?,?,?,?,?)").bind(
            credential.id,
            id,
            encode(credential.publicKey),
            credential.counter,
            JSON.stringify(credential.transports || []),
          ),
        ]);
        return json({ ok: true }, 200, {
          "Set-Cookie": await newSession(env, id),
        });
      }
      if (path === "/api/auth/login/verify" && challenge.kind === "login") {
        const response = body.response as AuthenticationResponseJSON;
        const key = await env.DB.prepare("SELECT * FROM passkeys WHERE id=?")
          .bind(response.id)
          .first<{
            id: string;
            owner: string;
            public_key: string;
            counter: number;
            transports: string;
          }>();
        if (!key) throw new Error("Unknown passkey");
        const result = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: origin.origin,
          expectedRPID: rpID,
          credential: {
            id: key.id,
            publicKey: decode(key.public_key),
            counter: key.counter,
            transports: JSON.parse(key.transports),
          },
          requireUserVerification: true,
        });
        if (!result.verified) throw new Error("Verification failed");
        await env.DB.prepare("UPDATE passkeys SET counter=? WHERE id=?")
          .bind(result.authenticationInfo.newCounter, key.id)
          .run();
        return json({ ok: true }, 200, {
          "Set-Cookie": await newSession(env, key.owner),
        });
      }
    } catch {
      return json(
        {
          detail:
            "Passkey verification failed. Try again with your registered device.",
        },
        400,
      );
    }
  }
  return json({ detail: "Authentication endpoint not found" }, 404);
}
