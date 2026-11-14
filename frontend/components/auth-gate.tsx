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
import { TrailIllustration } from "./trail-illustration";
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
      <div className="auth-page">
        <a className="skip-link" href="#signup-name">
          Skip to sign in
        </a>
        <header className="auth-header">
          <Brand />
          <a
            className="auth-github"
            href="https://github.com/Rylogix/Tracelet"
            target="_blank"
            rel="noreferrer"
          >
            Free & open source <ArrowUpRight size={15} />
          </a>
        </header>
        <div className="auth-layout">
          <section className="auth-story">
            <div className="auth-kicker">
              <span className="status-dot" /> FREE & OPEN SOURCE
            </div>
            <h1 aria-label="Your best start in free OSINT.">
              Your best start
              <br />
              <span>in free OSINT.</span>
            </h1>
            <p className="auth-lead">
              Search public profiles, inspect domains, analyze files, and manage
              your online presence.
            </p>

            <TrailIllustration />
            <div className="auth-principles">
              <span>
                <ScanLine size={15} />
                Source links
              </span>
              <span>
                <LockKeyhole size={15} />
                Private workspace
              </span>
              <span>
                <ShieldCheck size={15} />
                Encrypted API keys
              </span>
            </div>
          </section>
          <section className="auth-form-area">
            <div className="auth-card">
              <div className="auth-card-heading">
                <span className="auth-card-icon">
                  <Fingerprint size={24} />
                </span>
                <span className="auth-card-step">CREATE ACCOUNT</span>
                <h2>Create your workspace</h2>
                <p>
                  Sign up to save investigations and connect your own API keys.
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void authenticate(true);
                }}
              >
                <label htmlFor="signup-name">
                  Choose your Tracelet username
                </label>
                <div className="auth-input-wrap">
                  <span>@</span>
                  <input
                    id="signup-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    pattern="[A-Za-z0-9_-]{3,32}"
                    minLength={3}
                    maxLength={32}
                    autoComplete="username webauthn"
                    placeholder="your-username"
                    required
                    disabled={busy}
                  />
                </div>
                <p className="input-hint">
                  3–32 characters. Letters, numbers, hyphens, or underscores.
                </p>
                <Button className="auth-primary" disabled={busy} type="submit">
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <KeyRound size={17} />
                  )}{" "}
                  {busy
                    ? "Check your device…"
                    : "Create account with a passkey"}
                  {!busy && <ArrowRight size={16} />}
                </Button>
              </form>
              <div className="auth-divider">
                <span />
                Already have an account?
                <span />
              </div>
              <Button
                className="auth-secondary"
                variant="outline"
                disabled={busy}
                onClick={() => authenticate(false)}
              >
                Sign in with your passkey <ArrowRight size={16} />
              </Button>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <div className="passkey-explanation">
                <ShieldCheck size={18} />
                <div>
                  <strong>Passkey authentication</strong>
                  <p>
                    Use Face ID, your fingerprint, or a security key. Your
                    biometric data stays on your device.
                  </p>
                </div>
              </div>
              <p className="auth-recovery">
                Keep your passkey synced or backed up. Email recovery is not
                available.
              </p>
            </div>
            <div className="auth-outside-note">
              <LockKeyhole size={14} />
              <p>
                Investigations are private to your account.
                <br />
                File analysis happens entirely in your browser.
              </p>
            </div>
          </section>
        </div>
        <footer className="auth-footer">
          <span>© {new Date().getFullYear()} Tracelet</span>
          <span>Free and open source</span>
          <a
            href="https://github.com/Rylogix/Tracelet"
            target="_blank"
            rel="noreferrer"
          >
            Use public information responsibly <ArrowUpRight size={12} />
          </a>
        </footer>
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
