"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import {
  Fingerprint,
  KeyRound,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  LockKeyhole,
  ScanLine,
  LoaderCircle,
} from "lucide-react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { api } from "./api";
const Runtime = createContext({
  hosted: false,
  username: "",
  signOut: async () => {},
});
export const useRuntime = () => useContext(Runtime);
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<
    "loading" | "local" | "login" | "signed-in" | "error"
  >("loading");
  const [username, setUsername] = useState("");
  const [creating, setCreating] = useState(false);
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
  async function signOut() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    location.reload();
  }
  if (status === "login")
    return (
      <div className="auth-minimal">
        <header>
          <Brand />
          <a
            href="https://github.com/Rylogix/Tracelet"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <ArrowUpRight size={13} />
          </a>
        </header>
        <main className="auth-entry">
          <h1>Free OSINT.</h1>
          <div className="auth-entry-card">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void authenticate(true);
                }}
              >
                <label htmlFor="signup-name" className="sr-only">
                  Username
                </label>
                <input
                  id="signup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  pattern="[A-Za-z0-9_-]{3,32}"
                  title="3–32 letters, numbers, hyphens or underscores"
                  minLength={3}
                  maxLength={32}
                  autoComplete="username webauthn"
                  placeholder="Username"
                  required
                  disabled={busy}
                />
                <Button disabled={busy} type="submit">
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <KeyRound size={16} />
                  )}{" "}
                  {busy ? "Continue…" : "Create account"}
                </Button>
                <p className="recovery-note">
                  Back up your passkey. No email recovery.
                </p>
              </form>
            ) : (
              <Button disabled={busy} onClick={() => authenticate(false)}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <KeyRound size={16} />
                )}{" "}
                {busy ? "Continue…" : "Sign in"}
              </Button>
            )}
            <button
              className="auth-switch"
              disabled={busy}
              onClick={() => {
                setCreating(!creating);
                setError("");
              }}
            >
              {creating ? "Back to sign in" : "Create account"}
            </button>
            {error && (
              <div role="alert" className="error">
                {error}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  return (
    <Runtime.Provider
      value={{ hosted: status === "signed-in", username, signOut }}
    >
      {children}
    </Runtime.Provider>
  );
}
