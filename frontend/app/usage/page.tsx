"use client";
import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { api } from "@/components/api";
import { Button } from "@/components/ui/button";
type Usage = {
  provider: string;
  name: string;
  attempts: number;
  successes: number;
  failures: number;
  quota_limit: number | null;
  remaining: number | null;
  reset: string | null;
  last_update: string | null;
  last_success: string | null;
  percentage: number | null;
  source: string;
  safety_limit_per_minute: number;
  budget: number | null;
  alerts: number[];
  blocked_until: number;
  available: boolean;
};
export default function Usage() {
  const [rows, setRows] = useState<Usage[]>([]);
  const [error, setError] = useState("");
  const [thresholds, setThresholds] = useState<number[]>([50, 80, 90, 100]);
  const load = () =>
    api<Usage[]>("/usage")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    api<{ thresholds: number[] }>("/usage/alerts")
      .then((v) => setThresholds(v.thresholds))
      .catch(() => {});
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <div className="eyebrow">
        <Activity size={13} /> RESOURCE AWARENESS
      </div>
      <h1>Know what every request costs.</h1>
      <p className="subtitle">
        Real usage. Honest limits. No surprise paid requests.
      </p>
      <div className="notice">
        Local attempts include failures. Provider allowances and reset dates
        appear only when confirmed by supported response headers. Missing values
        mean unknown, never unlimited. Local budgets are lifetime attempt caps
        until you change them.
      </div>
      <div className="panel">
        <h2>Allowance alerts</h2>
        <p className="muted text-xs">
          Show an alert when a confirmed provider allowance reaches these
          thresholds.
        </p>
        <div className="actions">
          {[50, 80, 90, 100].map((n) => (
            <label className="check" key={n}>
              <input
                type="checkbox"
                checked={thresholds.includes(n)}
                onChange={async (e) => {
                  const next = e.target.checked
                    ? [...thresholds, n]
                    : thresholds.filter((t) => t !== n);
                  try {
                    await api("/usage/alerts", {
                      method: "PUT",
                      body: JSON.stringify({ thresholds: next }),
                    });
                    setThresholds(next);
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              />
              {n}%
            </label>
          ))}
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="integration-grid">
        {rows.map((r) => (
          <section className="panel" key={r.provider}>
            <div className="row">
              <h2>{r.name}</h2>
              <span className={"badge " + (r.available ? "good" : "")}>
                {r.blocked_until > Date.now() / 1000
                  ? "Rate limited"
                  : r.remaining === 0
                    ? "Exhausted"
                    : r.available
                      ? "Available"
                      : "Unavailable"}
              </span>
            </div>
            <p>{r.source}</p>
            <div className="metrics">
              <div>
                <small>ALLOWANCE</small>
                <strong>{r.quota_limit ?? "Unknown"}</strong>
              </div>
              <div>
                <small>LOCAL ATTEMPTS</small>
                <strong>{r.attempts}</strong>
              </div>
              <div>
                <small>REMAINING</small>
                <strong>{r.remaining ?? "Unknown"}</strong>
              </div>
            </div>
            <div className="meter">
              <div
                style={{
                  width:
                    r.percentage === null
                      ? "0%"
                      : Math.min(100, r.percentage) + "%",
                }}
              />
            </div>
            <p>
              {r.percentage === null
                ? "Allowance percentage unknown"
                : r.percentage.toFixed(1) + "% of reported allowance used"}{" "}
              · Reset:{" "}
              {r.reset ? new Date(r.reset).toLocaleString() : "Unknown"}
            </p>
            <p>
              {r.successes} successful · {r.failures} failed · Safety limit{" "}
              {r.safety_limit_per_minute}/minute
            </p>
            <p>
              Last success:{" "}
              {r.last_success
                ? new Date(r.last_success).toLocaleString()
                : "No successful request recorded"}
              <br />
              Last usage update:{" "}
              {r.last_update
                ? new Date(r.last_update).toLocaleString()
                : "Not recorded"}
            </p>
            {r.alerts.length > 0 && (
              <div className="notice">
                Usage alert: {r.alerts.join("%, ")}% threshold reached.
              </div>
            )}
            <form
              className="actions"
              onSubmit={async (e) => {
                e.preventDefault();
                const input = new FormData(e.currentTarget).get(
                  "budget",
                ) as string;
                try {
                  await api("/usage/" + r.provider + "/budget", {
                    method: "PUT",
                    body: JSON.stringify({
                      requests: input === "" ? null : Number(input),
                    }),
                  });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <input
                aria-label={r.name + " local request budget"}
                name="budget"
                type="number"
                min="0"
                max="1000000"
                placeholder="No local budget"
                defaultValue={r.budget ?? ""}
                className="w-40"
              />
              <Button size="sm" variant="outline">
                Save budget
              </Button>
            </form>
          </section>
        ))}
      </div>
    </>
  );
}
