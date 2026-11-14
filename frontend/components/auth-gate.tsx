"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { Fingerprint, KeyRound, LogOut } from "lucide-react";
import { Button } from "./ui/button";
import { api } from "./api";
const Runtime = createContext({ hosted: false, username: "" });
export const useRuntime = () => useContext(Runtime);
export function RuntimeStatus() {
  const { hosted, username } = useRuntime();
  return (
    <span className="local">
      <i />
      {hosted ? "Cloudflare · " + username : "Local instance"}
    </span>
  );
}
export function PrivacyCard() {
  const { hosted } = useRuntime();
  return (
    <>
      <strong>
        {hosted ? "Your workspace. Your access." : "Your machine. Your data."}
      </strong>
      <p>
        {hosted
          ? "Private account storage on Cloudflare."
          : "Local storage. No telemetry."}
        <br />
        Files stay on your device.
      </p>
    </>
  );
}
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<
    "loading" | "local" | "login" | "signed-in" | "error"
  >("loading");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const r = await fetch("/api/auth/me");
      if (r.status === 404) {
        const health = await api<{ status: string }>("/health");
        if (health.status !== "ok") throw new Error();
        setStatus("local");
        return;
      }
      if (!r.ok) throw new Error();
      const account = await r.json();
      setUsername(account.username || "");
      setStatus(account.authenticated ? "signed-in" : "login");
    } catch {
      setError("Tracelet could not connect to its backend. Please try again.");
      setStatus("error");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function authenticate(register: boolean) {
    setBusy(true);
    setError("");
    try {
      if (register) {
        const data = await api<{
          options: Parameters<typeof startRegistration>[0]["optionsJSON"];
          challengeId: string;
        }>("/auth/register/options", {
          method: "POST",
          body: JSON.stringify({ username: name }),
        });
        const response = await startRegistration({ optionsJSON: data.options });
        await api("/auth/register/verify", {
          method: "POST",
          body: JSON.stringify({ challengeId: data.challengeId, response }),
        });
      } else {
        const data = await api<{
          options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
          challengeId: string;
        }>("/auth/login/options", { method: "POST", body: "{}" });
        const response = await startAuthentication({
          optionsJSON: data.options,
        });
        await api("/auth/login/verify", {
          method: "POST",
          body: JSON.stringify({ challengeId: data.challengeId, response }),
        });
      }
      await load();
    } catch (e) {
      setError(
        (e as Error).name === "NotAllowedError"
          ? "Passkey prompt was cancelled. You can try again."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  if (status === "loading")
    return (
      <div className="auth-screen">
        <Fingerprint size={36} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (status === "error")
    return (
      <div className="auth-screen">
        <p role="alert">{error}</p>
        <Button onClick={load}>Try again</Button>
      </div>
    );
  if (status === "login")
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <span className="brand-icon">
            <Fingerprint size={34} />
          </span>
          <div className="eyebrow mt-6">TRACELET / YOUR PRIVATE WORKSPACE</div>
          <h1>Follow the public trail.</h1>
          <p className="subtitle">
            Free intelligence tools. Real sources. A workspace that belongs to
            you.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void authenticate(true);
            }}
          >
            <label htmlFor="signup-name">Choose your Tracelet username</label>
            <input
              id="signup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              pattern="[A-Za-z0-9_-]{3,32}"
              minLength={3}
              maxLength={32}
              autoComplete="username webauthn"
              placeholder="Your username"
              required
            />
            <Button disabled={busy} type="submit">
              <KeyRound size={16} />
              {busy ? "Check your device…" : "Create account with a passkey"}
            </Button>
          </form>
          <div className="auth-divider">Already have an account?</div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => authenticate(false)}
          >
            Sign in with your passkey
          </Button>
          <p className="notice">
            Use your device’s fingerprint, face unlock, or security key.
            Tracelet never receives your biometric data. Keep your passkey
            synced or backed up; email recovery is not available.
          </p>
          <p className="text-xs muted">
            By continuing, you agree to use public information responsibly.
            Hosted data is stored in the operator’s Cloudflare account. Files
            are analyzed only in your browser.
          </p>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
        </section>
      </div>
    );
  return (
    <Runtime.Provider value={{ hosted: status === "signed-in", username }}>
      {status === "signed-in" && (
        <button
          className="signout"
          onClick={async () => {
            await api("/auth/logout", { method: "POST", body: "{}" });
            location.reload();
          }}
        >
          <LogOut size={13} />
          Sign out
        </button>
      )}
      {children}
    </Runtime.Provider>
  );
}
