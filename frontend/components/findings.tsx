import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  FileCode2,
  Link2,
} from "lucide-react";
import type { Finding } from "./api";
const label = (key: string) =>
  key.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function text(value: unknown, key = ""): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "type" && typeof value === "string")
    return value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^./, (c) => c.toUpperCase());
  if (
    key === "country" &&
    typeof value === "string" &&
    /^[A-Z]{2}$/.test(value)
  ) {
    try {
      return (
        new Intl.DisplayNames(["en"], { type: "region" }).of(value) || value
      );
    } catch {
      return value;
    }
  }
  return String(value);
}
function Value({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== "object")
    return <span className="finding-text">{text(value)}</span>;
  if (Array.isArray(value)) {
    if (!value.length)
      return <span className="muted">No records returned</span>;
    if (value.every((v) => typeof v !== "object" || v === null))
      return (
        <ul className="finding-list">
          {value.map((v, i) => (
            <li key={i}>{text(v)}</li>
          ))}
        </ul>
      );
    return (
      <span className="finding-text">
        {value.length} {value.length === 1 ? "record" : "records"} available in
        source data
      </span>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([k, v]) => k !== "note" && v !== null && v !== undefined,
  );
  if (!entries.length)
    return <span className="muted">No additional properties returned</span>;
  return (
    <dl className="finding-properties">
      {entries.slice(0, depth ? 6 : 10).map(([key, v]) => (
        <div
          key={key}
          className={
            (typeof v === "object" && v !== null) || key === "note"
              ? "property-wide"
              : ""
          }
        >
          <dt>{label(key)}</dt>
          <dd>
            {typeof v === "object" && v !== null ? (
              depth < 1 ? (
                <Value value={v} depth={depth + 1} />
              ) : (
                <span>See source data</span>
              )
            ) : (
              text(v, key)
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function Findings({ items }: { items: Finding[] }) {
  return (
    <div className="results">
      {items.map((item, i) => (
        <article className="finding-card" key={i}>
          <div className="finding-source">
            <span>
              <Link2 size={13} />
              {item.source}
            </span>
            <span
              className={"confidence confidence-" + item.confidence}
              title="Confidence in this observation does not establish anyone’s identity."
            >
              <i />
              {item.confidence === "low"
                ? "Possible match"
                : label(item.confidence) + " confidence"}
            </span>
          </div>
          <h3>{item.title}</h3>
          <div className="finding-content">
            <Value value={item.value} />
          </div>
          <details className="source-data">
            <summary>
              <FileCode2 size={13} />
              View source data
            </summary>
            <pre>
              {typeof item.value === "string"
                ? item.value
                : JSON.stringify(item.value, null, 2)}
            </pre>
          </details>
          <div className="finding-footer">
            {item.evidence && /^https?:\/\//.test(item.evidence) ? (
              <a href={item.evidence} target="_blank" rel="noreferrer">
                View source <ArrowUpRight size={13} />
              </a>
            ) : (
              <span>
                <CheckCircle2 size={13} />
                Analyzed directly
              </span>
            )}
            <time dateTime={item.observed_at}>
              <Clock3 size={11} />
              {new Date(item.observed_at).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        </article>
      ))}
    </div>
  );
}
