"use client";
import { useState, useEffect } from "react";
import { Plug, KeyRound, ExternalLink } from "lucide-react";
import { api, type Integration } from "@/components/api";
import { Button } from "@/components/ui/button";
import { useRuntime } from "@/components/auth-gate";
import {UsageAlerts} from "@/components/usage-alerts";
export default function Integrations() {
  const { hosted } = useRuntime();
  const [filter, setFilter] = useState("All tools");
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
  const needsSetup = (i: Integration) =>
    ["API key required", "Connection test required"].includes(i.status);
  const filteredItems = items.filter(
    (i) =>
      filter === "All tools" ||
      (filter === "Ready to use"
        ? i.available
        : filter === "Needs setup"
          ? needsSetup(i)
          : !i.available && !needsSetup(i)),
  );
  const filters = ["All tools", "Ready to use", "Needs setup", "Unavailable"];
  const counts = [
    items.length,
    items.filter((i) => i.available).length,
    items.filter(needsSetup).length,
    items.filter((i) => !i.available && !needsSetup(i)).length,
  ];
  return (
    <>
      <h1>Integrations</h1>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      <div className="tool-filters" aria-label="Filter integrations">
        {filters.map((name, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
            <span>{counts[index]}</span>
          </button>
        ))}
      </div>
      {!filteredItems.length && (
        <div className="empty">
          <strong>No tools in this view.</strong>
          <p></p>
        </div>
      )}
      <div className="integration-grid">
        {filteredItems.map((i) => (
          <section className="panel" key={i.id}>
            <div className="row">
              <h2>{i.name}</h2>
              <span className={"badge " + (i.available ? "good" : "")}>
                {i.status}
              </span>
            </div>
            <div className="actions">
              <span className="badge">
                {i.credential ? "Personal key required" : "No API key"}
              </span>
              {i.free_tier && <span className="badge">Free tier offered</span>}
            </div>
            {i.credential && (
              <>
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
            <details className="compact-details">
              <summary>Details</summary>
              <p>{i.description}</p>
              <p>
                {i.quota_reporting}
                <br />
                {i.rate !== null
                  ? "Safety rate: " +
                    i.rate +
                    "/minute · Last success: " +
                    (health.find((h) => h.provider === i.id)?.last_success
                      ? new Date(
                          health.find((h) => h.provider === i.id)!
                            .last_success!,
                        ).toLocaleString()
                      : "Not recorded")
                  : i.id==='username-discovery'?'Limits tracked per site':["email-security","network"].includes(i.id)?'Shared DNS provider limits':"No external API quota"}
              </p>
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
      <UsageAlerts/>
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
