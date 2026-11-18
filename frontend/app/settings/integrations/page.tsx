"use client";
import { useState, useEffect } from "react";
import { KeyRound, ExternalLink } from "lucide-react";
import { api, type Integration } from "@/components/api";
import { Button } from "@/components/ui/button";
import { useRuntime } from "@/components/auth-gate";
import {SettingsUsage} from "@/components/settings-usage";
export default function Integrations() {
  const { hosted } = useRuntime();
  const [items, setItems] = useState<Integration[] | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const load = () => api<Integration[]>("/integrations").then(setItems);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function action(id: string, operation: string) {
    setBusy(id);
    setMessage("");
    try {
      if (operation === "test") {
        await api("/integrations/" + id + "/test", { method: "POST" });
        setMessage(
          "Connection succeeded. The test request is included in API usage.",
        );
      } else {
        await api("/integrations/" + id + "/key", {
          method: operation === "delete" ? "DELETE" : "PUT",
          ...(operation === "delete"
            ? {}
            : { body: JSON.stringify({ key: keys[id] }) }),
        });
        setKeys({ ...keys, [id]: "" });
        setMessage(
          operation === "delete"
            ? "Credentials removed."
            : "Key encrypted and saved server-side.",
        );
        await load();
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const configurable = items?.filter((i) => i.credential && i.installed);
  return (
    <>
      <h1>Integrations</h1>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!items && !message && <p role="status">Loading integrations…</p>}
      {configurable?.length === 0 && <p>No integrations to configure.</p>}
      <div className="integration-grid">
        {configurable?.map((i) => (
          <section className="panel" key={i.id}>
            <div className="row">
              <h2>{i.name}</h2>
              <span className={"badge " + (i.available ? "good" : "")}>
                {i.status}
              </span>
            </div>
            <div className="actions">
              <span className="badge">
                Personal key required
              </span>
              {i.free_tier && <span className="badge">Free tier offered</span>}
            </div>
            <label className="check" htmlFor={"key-" + i.id}>
              <KeyRound size={13} />
              {i.connected ? "Saved key: ••••••••" : "Personal API key"}
            </label>
            <input
              id={"key-" + i.id}
              type="password"
              autoComplete="off"
              value={keys[i.id] || ""}
              onChange={(e) => setKeys({ ...keys, [i.id]: e.target.value })}
              placeholder="API key"
            />
            <div className="actions">
              <Button
                size="sm"
                disabled={!keys[i.id] || busy === i.id}
                onClick={() => action(i.id, "save")}
              >
                {i.connected ? "Replace key" : "Connect"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!i.connected || busy === i.id}
                onClick={() => action(i.id, "delete")}
              >
                Disconnect
              </Button>
              {i.id === "virustotal" && <Button
                size="sm"
                variant="outline"
                disabled={!i.connected || busy === i.id}
                onClick={() => action(i.id, "test")}
              >
                Test connection
              </Button>}
            </div>
            <details className="compact-details">
              <summary>Details</summary>
              <p>{i.description}</p>
              <p>{i.quota_reporting}</p>
              <div className="actions">
                <a href={i.docs} target="_blank" rel="noreferrer">
                  Documentation <ExternalLink size={10} className="inline" />
                </a>
                {i.registration && (
                  <a href={i.registration} target="_blank" rel="noreferrer">
                    Get your own key ↗
                  </a>
                )}
              </div>
            </details>
          </section>
        ))}
      </div>
      <SettingsUsage/>
      {hosted && <details className="panel mt-8">
        <summary>Account</summary>
        <Button variant="outline" onClick={async () => {
          if (!window.confirm("Permanently delete your Tracelet account and all associated data?")) return;
          try { await api("/account", { method: "DELETE" }); location.reload(); }
          catch (e) { setMessage((e as Error).message); }
        }}>Delete my account and data</Button>
      </details>}
    </>
  );
}
