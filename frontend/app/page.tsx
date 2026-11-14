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
  const [selectedCategory, setSelectedCategory] = useState("Auto");
  const [query, setQuery] = useState("");
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [history, setHistory] = useState<History[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
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
          body: JSON.stringify({
            query,
            history: historyEnabled,
            kind:
              selectedCategory === "Auto"
                ? undefined
                : selectedCategory.toLowerCase(),
          }),
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
      <section className="hero">
        <div>
          <h1 className="hero-title" aria-label="Free OSINT.">
            Free OSINT.
          </h1>
        </div>
      </section>
      <form className="search-panel" onSubmit={search}>
        <div className="search-panel-heading">
          <label className="sr-only" htmlFor="query">
            Search
          </label>
          <span className="search-shortcut">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </div>
        <div className="search-row">
          <Search size={21} />
          <input
            id="query"
            aria-label="Search"
            ref={searchInput}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Username, email, phone or domain"
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
            {busy ? "Searching…" : "Search"}
            <ArrowRight size={16} />
          </Button>
        </div>
        <div className="search-footer">
          <button
            type="button"
            className="upload-link"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={14} />
            File
          </button>
          {hint && <span>{hint}</span>}
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
                {job.checks
                  ? `${job.findings.length} matches · ${job.completed}/${job.total} sites`
                  : `${job.kind} · ${job.status}`}
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
          {job.checks && (
            <details className="compact-details">
              <summary>
                Checks ({job.completed}/{job.total})
              </summary>
              <ul className="check-list">
                {job.checks.map((c) => (
                  <li key={c.provider}>
                    <span>{c.platform}</span>
                    <span>
                      {c.status === "found"
                        ? "Match"
                        : c.status === "not_found"
                          ? "Not found"
                          : c.reason || "Unavailable"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!job.checks &&
            (job.notes.length > 0 ||
              job.unavailable.length > 0 ||
              job.errors.length > 0) && (
              <details className="compact-details">
                <summary>Details</summary>
                {job.notes.map((n, i) => (
                  <p key={"note" + i}>{n}</p>
                ))}
                {job.unavailable.map((m, i) => (
                  <p key={"off" + i}>
                    {m.name}: {m.reason}
                  </p>
                ))}
                {job.errors.map((m, i) => (
                  <p key={"err" + i}>
                    {m.source}: {m.message}
                  </p>
                ))}
              </details>
            )}
          <Findings items={job.findings} />
          {!job.findings.length &&
            !["running", "queued"].includes(job.status) && (
              <div className="empty">No confirmed matches.</div>
            )}
        </section>
      )}
      {files.length > 0 && (
        <section className="panel">
          <div className="row">
            <h2>File</h2>
            <Button
              variant="outline"
              onClick={() => download(files, "tracelet-file.json")}
            >
              <Download size={14} />
              Export
            </Button>
          </div>

          <Findings items={files} />
        </section>
      )}
      <div className="search-types" aria-label="Search type">
        {["Auto", "Username", "Email", "Phone", "Website"].map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={selectedCategory === type}
            onClick={() => {
              setSelectedCategory(type);
              setHint(type === "Phone" ? "Include country code." : "");
              searchInput.current?.focus();
            }}
          >
            {type}
          </button>
        ))}
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
          <h2>History</h2>
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
        </div>
      )}
    </>
  );
}
