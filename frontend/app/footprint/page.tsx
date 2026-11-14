"use client";
import { useEffect, useState } from "react";
import { Fingerprint, Download, Trash2, ShieldCheck } from "lucide-react";
import { api, download } from "@/components/api";
import { Button } from "@/components/ui/button";
import { useRuntime } from "@/components/auth-gate";
type Profile = {
  id: string;
  url: string;
  username: string;
  status: string;
  created: string;
  challenge?: string;
  monitoring?: number;
  last_scan?: string;
};
type Alert = { id: string; message: string; created: string };
export default function Footprint() {
  const { hosted } = useRuntime();
  const [items, setItems] = useState<Profile[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setItems(await api<Profile[]>("/footprint"));
    setAlerts(await api<Alert[]>("/alerts"));
  };
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function action(id: string, type: string, body?: unknown) {
    setError("");
    setBusy(true);
    try {
      await api("/footprint/" + id + (type ? "/" + type : ""), {
        method: type === "monitoring" ? "PUT" : type ? "POST" : "DELETE",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>My digital footprint</h1>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          setBusy(true);
          setError("");
          try {
            await api("/footprint", {
              method: "POST",
              body: JSON.stringify({
                username: data.get("username"),
                url: data.get("url"),
              }),
            });
            form.reset();
            await load();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          name="username"
          aria-label="Your username"
          placeholder="Your username"
          required
          maxLength={80}
        />
        <input
          name="url"
          aria-label="Public profile URL"
          type="url"
          placeholder="https://github.com/your-profile"
          required
          maxLength={500}
        />
        <Button disabled={busy}>Add my account</Button>
      </form>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {alerts.map((a) => (
        <div className="notice" key={a.id}>
          {a.message} <small>{new Date(a.created).toLocaleString()}</small>
        </div>
      ))}
      <div className="section-heading">
        <h2>
          My accounts <span className="muted">({items.length})</span>
        </h2>
        <Button
          variant="outline"
          onClick={() => download(items, "tracelet-footprint.json")}
        >
          <Download size={14} />
          Export
        </Button>
      </div>
      {items.length ? (
        items.map((i) => (
          <section className="panel" key={i.id}>
            <div className="row">
              <div>
                <h2>{i.username}</h2>
                <a
                  href={i.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-200 text-xs break-all"
                >
                  {i.url}
                </a>
              </div>
              <div className="actions">
                <span
                  className={"badge " + (i.status === "verified" ? "good" : "")}
                >
                  {i.status === "verified" ? "Verified control" : "Unverified"}
                </span>
                <Button
                  aria-label={"Delete " + i.username}
                  variant="outline"
                  disabled={busy}
                  onClick={() => action(i.id, "")}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
            {i.status !== "verified" ? (
              <div className="actions mt-5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => action(i.id, "challenge")}
                >
                  Verify account
                </Button>
                {i.challenge && (
                  <>
                    <code className="text-xs break-all text-neutral-200 select-all">
                      {i.challenge}
                    </code>
                    <p className="muted text-xs">
                      Add this to your GitHub bio, then verify.
                    </p>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => action(i.id, "verify")}
                    >
                      <ShieldCheck size={13} />
                      Verify control
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <label className="check mt-5">
                <input
                  type="checkbox"
                  checked={!!i.monitoring}
                  disabled={busy}
                  onChange={(e) =>
                    action(i.id, "monitoring", {
                      enabled: e.target.checked,
                      interval_hours: 24,
                    })
                  }
                />
                Monitor my public profile daily · Last checked:{" "}
                {i.last_scan
                  ? new Date(i.last_scan).toLocaleString()
                  : "Not yet"}
              </label>
            )}
          </section>
        ))
      ) : (
        <div className="empty">
          <Fingerprint size={26} />
          <strong>No accounts added</strong>
        </div>
      )}
      {hosted && (
        <section className="panel mt-8">
          <h2>Delete my Tracelet account</h2>
          <p className="muted text-xs">
            Permanently removes your account and saved data.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              if (
                window.confirm(
                  "Permanently delete your Tracelet account and all associated data?",
                )
              ) {
                try {
                  await api("/account", { method: "DELETE" });
                  location.reload();
                } catch (e) {
                  setError((e as Error).message);
                }
              }
            }}
          >
            Delete my account and data
          </Button>
        </section>
      )}
    </>
  );
}
