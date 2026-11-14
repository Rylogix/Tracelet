"use client";
import { useState, useEffect } from "react";
import { useRuntime } from "@/components/auth-gate";
import { Plug, KeyRound, ExternalLink } from "lucide-react";
import { api, type Integration } from "@/components/api";
import { Button } from "@/components/ui/button";
export default function Integrations() {
  const { hosted } = useRuntime();
  const [items, setItems] = useState<Integration[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [health, setHealth] = useState<
    {
      provider: string;
      last_success: string | null;
      attempts: number;
      safety_limit_per_minute: number;
    }[]
  >([]);
  const [busy, setBusy] = useState("");
  const load = () => api<Integration[]>("/integrations").then(setItems);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
    api<typeof health>("/usage")
      .then(setHealth)
      .catch(() => {});
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
  return (
    <>
      <div className="eyebrow">
        <Plug size={13} /> SETTINGS / INTEGRATIONS
      </div>
      <h1>Good sources. Clear boundaries.</h1>
      <p className="subtitle">
        Keyless tools need no account. Optional providers use your credentials
        and quotas.
      </p>
      <div className="notice">
        No paid API usage is enabled. Optional providers must be used within
        your free allocation. Unknown quotas are labeled explicitly. Keys never
        return to this page after saving.
      </div>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="integration-grid">
        {items.map((i) => (
          <section className="panel" key={i.id}>
            <div className="row">
              <h2>{i.name}</h2>
              <span className={"badge " + (i.available ? "good" : "")}>
                {i.status}
              </span>
            </div>
            <p>{i.description}</p>
            <div className="actions">
              <span className="badge">
                {i.credential ? "Personal key required" : "No API key"}
              </span>
              {i.free_tier && <span className="badge">Free tier offered</span>}
            </div>
            <p>
              {i.quota_reporting}
              <br />
              {i.rate !== null
                ? "Safety rate: " +
                  i.rate +
                  "/minute · Last success: " +
                  (health.find((h) => h.provider === i.id)?.last_success
                    ? new Date(
                        health.find((h) => h.provider === i.id)!.last_success!,
                      ).toLocaleString()
                    : "Not recorded")
                : "No external API quota"}
            </p>
            {i.credential && (
              <>
                <label className="check" htmlFor={"key-" + i.id}>
                  <KeyRound size={13} />
                  {i.connected
                    ? "Saved key: •••••••• · enter a replacement"
                    : "Personal API key"}
                </label>
                <input
                  id={"key-" + i.id}
                  type="password"
                  autoComplete="off"
                  value={keys[i.id] || ""}
                  onChange={(e) => setKeys({ ...keys, [i.id]: e.target.value })}
                  placeholder="Enter your own API key"
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !i.connected || busy === i.id || i.id !== "virustotal"
                    }
                    onClick={() => action(i.id, "test")}
                  >
                    Test connection
                  </Button>
                </div>
              </>
            )}
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
          </section>
        ))}
      </div>
    </>
  );
}
