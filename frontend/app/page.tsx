"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRuntime } from "@/components/auth-gate";
import { analyzeFile } from "@/components/analyze-file";
import { Findings } from "@/components/findings";
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
  Sparkles,
  Upload,
  Download,
  Square,
  X,
  ArrowUpRight,
  LockKeyhole,
  FolderSearch,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, download, type Job, type Finding } from "@/components/api";
const categories = [
  {
    name: "Username",
    icon: AtSign,
    description: "Find public GitHub profile information.",
    example: "",
    note: "Public GitHub profiles. Matching handles do not establish identity.",
  },
  {
    name: "Email",
    icon: Mail,
    description: "Inspect public DNS and mail records.",
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
    description: "Extract metadata from images and PDF files.",
    example: "",
    note: "Images and PDFs up to 10 MB. Nothing retained.",
  },
  {
    name: "Website",
    icon: Globe,
    description: "View DNS records and domain registration data.",
    example: "example.com",
    note: "Public domains only. No active security scanning.",
  },
  {
    name: "My digital footprint",
    icon: Fingerprint,
    description: "Save your accounts and monitor verified profiles.",
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
export default function Home() {
  const { hosted } = useRuntime();
  const [selectedCategory, setSelectedCategory] = useState("");
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
    const focusSearch = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);
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
            <Sparkles size={13} /> FIRST-TIME SETUP
          </div>
          <h2>Search history preferences</h2>
          <p>
            {hosted
              ? "Your investigations are stored privately in your account."
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
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> INVESTIGATE
          </div>
          <h1 className="hero-title" aria-label="Your free OSINT workspace.">
            Your free OSINT<span>workspace.</span>
          </h1>
          <p className="subtitle">
            Search public information by username, email, phone number, domain,
            or file.
          </p>
        </div>
        <div className="hero-privacy">
          <LockKeyhole size={19} />
          <span>
            Private workspace<small>Investigations are private.</small>
          </span>
        </div>
      </section>
      <form className="search-panel" onSubmit={search}>
        <div className="search-panel-heading">
          <label htmlFor="query">What would you like to investigate?</label>
          <span className="search-shortcut">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </div>
        <div className="search-row">
          <Search size={21} />
          <input
            id="query"
            ref={searchInput}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCategory("");
            }}
            placeholder="Enter a username, email, phone, or website"
            required
            maxLength={253}
          />
          {query && (
            <button
              type="button"
              className="clear-search icon-button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                searchInput.current?.focus();
              }}
            >
              <X size={16} />
            </button>
          )}
          <Button
            disabled={
              busy || (!!job && ["queued", "running"].includes(job.status))
            }
            type="submit"
          >
            {busy ? "Working…" : "Investigate"}
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="search-hints">
          <span>
            <Sparkles size={13} />
            {hint}
          </span>
          <button
            type="button"
            className="upload-link"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            Analyze a file
          </button>
        </div>
        <div className="search-examples">
          <span>Examples:</span>
          {[
            { label: "A public username", value: "octocat" },
            { label: "example.com", value: "example.com" },
            { label: "An international number", value: "+442079460018" },
          ].map((e) => (
            <button
              key={e.value}
              type="button"
              onClick={() => {
                setQuery(e.value);
                searchInput.current?.focus();
              }}
            >
              {e.label}
              <ArrowUpRight size={11} />
            </button>
          ))}
        </div>
      </form>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {job && (
        <section className="panel investigation-panel" aria-live="polite">
          <div className="row">
            <div>
              <span className="eyebrow">INVESTIGATION</span>
              <h2 className="investigation-query">{job.query}</h2>
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
          {job.total > 0 && ["queued", "running"].includes(job.status) && (
            <div
              className="job-progress"
              role="progressbar"
              aria-label="Investigation progress"
              aria-valuenow={job.completed}
              aria-valuemax={job.total}
            >
              <span
                style={{ width: (job.completed / job.total) * 100 + "%" }}
              />
            </div>
          )}
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
        <div>
          <span className="section-kicker">EXPLORE</span>
          <h2>Choose a search type</h2>
        </div>
        <span>6 categories</span>
      </div>
      <div className="categories">
        {categories.map((c) =>
          c.name === "My digital footprint" ? (
            <Link
              className="category category-footprint"
              href="/footprint"
              key={c.name}
            >
              <span className="icon">
                <c.icon size={19} />
              </span>
              <ArrowRight className="arrow" size={15} />
              <div className="category-copy">
                <strong>{c.name}</strong>
                <p>{c.description}</p>
              </div>
            </Link>
          ) : (
            <button
              type="button"
              className={
                "category category-" +
                c.name.toLowerCase() +
                (selectedCategory === c.name ? " selected" : "")
              }
              aria-pressed={selectedCategory === c.name}
              key={c.name}
              onClick={() => {
                setSelectedCategory(c.name);
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
              <div className="category-copy">
                <strong>{c.name}</strong>
                <p>{c.description}</p>
              </div>
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
        <div>
          <span className="section-kicker">HISTORY</span>
          <h2>Saved investigations</h2>
        </div>
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
                <span className="history-icon">
                  <FolderSearch size={17} />
                </span>
                <span className="history-copy">
                  <strong>{h.query}</strong>
                  <small>
                    {h.kind} ·{" "}
                    {new Date(h.created).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </span>
              </span>
              <span>
                <span className="history-status">
                  {h.status === "completed" && <CheckCircle2 size={12} />}{" "}
                  {h.status}
                </span>
                <ArrowRight className="inline ml-2" size={15} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <span className="empty-icon">
            <FolderSearch size={24} />
          </span>
          <strong>No saved investigations</strong>
          <p>Enable history to save and reopen searches.</p>
          <span className="empty-footnote">
            <LockKeyhole size={12} />
            History is optional.
          </span>
        </div>
      )}
      <div className="responsible-note">
        <ShieldCheck size={14} className="inline mr-2" />
        Use Tracelet responsibly. Only investigate information you are
        authorized to access.{" "}
        <Link href="/settings/integrations" className="text-neutral-200">
          View available tools <ArrowUpRight size={12} />
        </Link>
      </div>
    </>
  );
}
