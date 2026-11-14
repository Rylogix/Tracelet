"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRuntime } from "@/components/auth-gate";
import { analyzeFile } from "@/components/analyze-file";
import {
  Search,
  ArrowRight,
  AtSign,
  Mail,
  Phone,
  FileSearch,
  Globe,
  Fingerprint,
  ShieldCheck,
  Clock3,
  Sparkles,
  Upload,
  Download,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, download, type Job, type Finding } from "@/components/api";
const categories = [
  {
    name: "Username",
    icon: AtSign,
    description: "Explore public profiles and possible username matches.",
    example: "",
    note: "Public GitHub profiles. Matching handles do not establish identity.",
  },
  {
    name: "Email",
    icon: Mail,
    description: "Understand the public mail infrastructure behind an address.",
    example: "hello@example.com",
    note: "Domain records only. No account enumeration.",
  },
  {
    name: "Phone",
    icon: Phone,
    description:
      "Check number format, country, and numbering-plan information.",
    example: "+442079460018",
    note: "Include an international country code.",
  },
  {
    name: "Files",
    icon: FileSearch,
    description: "Look beneath the surface of images and PDF documents.",
    example: "",
    note: "Images and PDFs up to 10 MB. Nothing retained.",
  },
  {
    name: "Website",
    icon: Globe,
    description: "Inspect DNS records and public domain registration.",
    example: "example.com",
    note: "Public domains only. No active security scanning.",
  },
  {
    name: "My digital footprint",
    icon: Fingerprint,
    description: "Keep your own public accounts together in one private space.",
    example: "",
    note: "",
  },
];
type History = {
  id: string;
  query: string;
  kind: string;
  status: string;
  created: string;
};
function Findings({ items }: { items: Finding[] }) {
  return (
    <div className="results">
      {items.map((item, i) => (
        <article className="result" key={i}>
          <div className="result-top">
            <strong>{item.title}</strong>
            <small>{item.source}</small>
            <span className="badge">{item.confidence} confidence</span>
          </div>
          <pre>
            {typeof item.value === "string"
              ? item.value
              : JSON.stringify(item.value, null, 2)}
          </pre>
          {item.evidence && /^https?:\/\//.test(item.evidence) && (
            <a href={item.evidence} target="_blank" rel="noreferrer">
              View source ↗
            </a>
          )}
          <time>{new Date(item.observed_at).toLocaleString()}</time>
        </article>
      ))}
    </div>
  );
}
export default function Home() {
  const { hosted } = useRuntime();
  const [query, setQuery] = useState("");
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [setup, setSetup] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(
    "Automatically detects usernames, emails, phone numbers, and domains.",
  );
  const [files, setFiles] = useState<Finding[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const refreshHistory = () =>
    api<History[]>("/history")
      .then(setHistory)
      .catch(() => {});
  useEffect(() => {
    api<{ complete: boolean; history: boolean }>("/setup")
      .then((s) => {
        setSetup(!s.complete);
        setHistoryEnabled(s.history);
      })
      .catch((e) => setError(e.message));
    refreshHistory();
  }, []);
  useEffect(() => {
    if (!job || !["queued", "running"].includes(job.status)) return;
    const timer = setInterval(
      () =>
        api<Job>("/search/" + job.id)
          .then((j) => {
            setJob(j);
            if (!["queued", "running"].includes(j.status)) refreshHistory();
          })
          .catch((e) => setError(e.message)),
      800,
    );
    return () => clearInterval(timer);
  }, [job]);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFiles([]);
    setBusy(true);
    try {
      setJob(
        await api<Job>("/search", {
          method: "POST",
          body: JSON.stringify({ query, history: historyEnabled }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setJob(null);
    setError("");
    try {
      setFiles(await analyzeFile(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {setup && (
        <section className="setup">
          <div className="eyebrow">
            <Sparkles size={13} /> WELCOME TO YOUR WORKSPACE
          </div>
          <h2>A little clarity before you begin.</h2>
          <p>
            {hosted
              ? "Your account data is stored privately in Cloudflare D1."
              : "Tracelet runs on your machine."}{" "}
            Keyless modules are configured automatically. Optional API keys stay
            encrypted server-side. Files stay on your device. Results do not
            establish identity.{" "}
            {hosted
              ? "Unsaved search jobs expire after one hour; saved history after 30 days."
              : "History is off by default."}
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={historyEnabled}
              onChange={(e) => setHistoryEnabled(e.target.checked)}
            />
            {hosted
              ? "Save history to my private account for 30 days"
              : "Save history locally for 30 days"}
          </label>
          <Button
            onClick={async () => {
              try {
                await api("/setup", {
                  method: "POST",
                  body: JSON.stringify({ history: historyEnabled }),
                });
                setSetup(false);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Open my workspace <ArrowRight size={14} />
          </Button>
        </section>
      )}
      <section className="hero">
        <div className="eyebrow">
          <span className="dot" /> YOUR PRIVATE INTELLIGENCE WORKSPACE
        </div>
        <h1>Every trail starts with a clue.</h1>
        <p className="subtitle">
          Explore public information. Connect the dots. Keep your workspace
          private.
        </p>
      </section>
      <form className="search-panel" onSubmit={search}>
        <label htmlFor="query">What would you like to investigate?</label>
        <div className="search-row">
          <Search size={19} />
          <input
            id="query"
            ref={searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="A username, email, phone number, or website…"
            required
            maxLength={253}
          />
          <Button
            disabled={
              busy || (!!job && ["queued", "running"].includes(job.status))
            }
            type="submit"
          >
            {busy ? "Working…" : "Investigate"} <ArrowRight size={15} />
          </Button>
        </div>
        <div className="search-hints">
          <span>
            <Sparkles size={12} />
            {hint}
          </span>
          <span>
            <ShieldCheck size={12} />
            Private workspace · Real sources
          </span>
        </div>
      </form>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {job && (
        <section className="panel" aria-live="polite">
          <div className="row">
            <div>
              <h2>{job.query}</h2>
              <p
                className={
                  ["running", "queued"].includes(job.status)
                    ? "loading"
                    : "muted"
                }
              >
                {job.kind} · {job.status} · {job.completed}/{job.total} modules
              </p>
            </div>
            <div className="actions">
              {["queued", "running"].includes(job.status) && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      setJob(
                        await api<Job>("/search/" + job.id + "/cancel", {
                          method: "POST",
                        }),
                      );
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <Square size={13} />
                  Cancel
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => download(job, "tracelet-investigation.json")}
              >
                <Download size={14} />
                Export
              </Button>
            </div>
          </div>
          {job.notes.map((n, i) => (
            <p className="notice" key={i}>
              {n}
            </p>
          ))}
          {job.unavailable.map((m, i) => (
            <p className="notice" key={i}>
              {m.name}: {m.reason}
            </p>
          ))}
          {job.errors.map((m, i) => (
            <p className="error" key={i}>
              {m.source}: {m.message}
            </p>
          ))}
          <Findings items={job.findings} />
          {!job.findings.length &&
            !["running", "queued"].includes(job.status) && (
              <div className="empty">
                No findings returned. This is not evidence of absence.
              </div>
            )}
        </section>
      )}
      {files.length > 0 && (
        <section className="panel">
          <div className="row">
            <h2>Local file analysis</h2>
            <Button
              variant="outline"
              onClick={() => download(files, "tracelet-file.json")}
            >
              <Download size={14} />
              Export
            </Button>
          </div>
          <p className="notice">
            Analyzed in your browser. No upload sent or retained.
          </p>
          <Findings items={files} />
        </section>
      )}
      <div className="section-heading">
        <h2>Choose your starting point</h2>
        <span>Six ways to find clarity</span>
      </div>
      <div className="categories">
        {categories.map((c) =>
          c.name === "My digital footprint" ? (
            <Link className="category" href="/footprint" key={c.name}>
              <span className="icon">
                <c.icon size={19} />
              </span>
              <ArrowRight className="arrow" size={15} />
              <strong>{c.name}</strong>
              <p>{c.description}</p>
            </Link>
          ) : (
            <button
              type="button"
              className="category"
              key={c.name}
              onClick={() => {
                setHint(c.note);
                if (c.name === "Files") fileInput.current?.click();
                else {
                  setQuery(c.example);
                  searchInput.current?.focus();
                }
              }}
            >
              <span className="icon">
                <c.icon size={19} />
              </span>
              <ArrowRight className="arrow" size={15} />
              <strong>{c.name}</strong>
              <p>{c.description}</p>
            </button>
          ),
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.pdf,video/*,.doc,.docx,.txt"
        aria-label="Upload file for local analysis"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
          e.target.value = "";
        }}
      />
      <div className="section-heading">
        <h2>Saved investigations</h2>
        <div className="actions">
          <label className="check">
            <input
              type="checkbox"
              checked={historyEnabled}
              onChange={async (e) => {
                const enabled = e.target.checked;
                setHistoryEnabled(enabled);
                await api("/setup", {
                  method: "POST",
                  body: JSON.stringify({ history: enabled }),
                }).catch((e) => setError(e.message));
              }}
            />
            {hosted ? "Save to account" : "Save locally"}
          </label>
          {history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api("/history", { method: "DELETE" });
                refreshHistory();
              }}
            >
              Clear history
            </Button>
          )}
        </div>
      </div>
      {history.length ? (
        <div className="panel">
          {history.map((h) => (
            <button
              className="history-item"
              key={h.id}
              onClick={() =>
                api<Job>("/search/" + h.id)
                  .then(setJob)
                  .catch((e) => setError(e.message))
              }
            >
              <span>
                {h.query}
                <span className="muted"> · {h.kind}</span>
              </span>
              <span>
                {h.status} <ArrowRight className="inline ml-2" size={13} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Clock3 size={23} />
          <strong>A clean slate. A new perspective.</strong>Your saved
          investigations will appear here. History is off by default.
        </div>
      )}
      <div className="notice">
        <ShieldCheck size={14} className="inline mr-2" />
        Use Tracelet responsibly. Only investigate information you are
        authorized to access.{" "}
        <Link href="/settings/integrations" className="text-violet-300">
          Check module availability ↗
        </Link>
      </div>
    </>
  );
}
