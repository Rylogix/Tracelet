"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileText, Trash2 } from "lucide-react";
import { api } from "@/components/api";
import type { ProviderUsage } from "@/components/usage-model";
import { useWorkflow } from "@/components/workflow";

const categories: Record<string, string> = {
  username: "Username", email: "Email", phone: "Number", file: "Files", website: "Website",
};

export default function Dashboard() {
  const { draft, history, historyLoaded, deleteReport } = useWorkflow();
  const [usage, setUsage] = useState<ProviderUsage[] | null>(null);
  const [usageError, setUsageError] = useState(false);
  const [historyError, setHistoryError] = useState("");
  useEffect(() => {
    let active = true;
    api<ProviderUsage[]>("/usage")
      .then(rows => { if (active) setUsage(rows); })
      .catch(() => { if (active) setUsageError(true); });
    return () => { active = false; };
  }, []);

  const recentReportLimit = 100;
  const savedCount = history.length === recentReportLimit ? `${recentReportLimit}+` : history.length;
  const entries = draft?.entries ?? [];
  const included = entries.filter(entry => entry.included);
  const categoriesUsed = Object.entries(categories).map(([kind, name]) => ({
    name, count: entries.filter(entry => entry.job.kind === kind).length,
  }));
  const activeSources = usage?.filter(row => row.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts);
  const requests = usage?.filter(row => row.unit !== "searches")
    .reduce((total, row) => total + row.attempts, 0);

  return <div className="workflow-page dashboard-page">
    <div className="page-heading"><h1>Dashboard</h1></div>
    <dl className="dashboard-metrics">
      <div className="panel"><dt>Saved reports</dt><dd>{historyLoaded ? savedCount : "—"}</dd></div>
      <div className="panel"><dt>Searches in draft</dt><dd>{draft ? entries.length : "—"}</dd></div>
      <div className="panel"><dt>Findings in draft report</dt><dd>{draft ? included.reduce((total, entry) => total + entry.job.findings.length, 0) : "—"}</dd></div>
      <div className="panel"><dt>Locally tracked API requests</dt><dd>{requests ?? "—"}</dd></div>
    </dl>

    <div className="dashboard-grid">
      <section className="panel">
        <h2>Searches by category</h2>
        <p>Current workspace, including searches left out of the draft report.</p>
        {draft && <dl className="dashboard-breakdown">{categoriesUsed.map(({ name, count }) =>
          <div key={name}>
            <dt>{name}</dt>
            <dd><span className="dashboard-track" aria-hidden="true"><span style={{ width: entries.length ? `${count / entries.length * 100}%` : 0 }} /></span>{count}</dd>
          </div>
        )}</dl>}
      </section>

      <section className="panel">
        <h2>Recent searches</h2>
        {!draft ? <p>Loading workspace…</p> : !entries.length ? <p>No searches in this workspace yet.</p> :
          <ul className="dashboard-activity">{entries.slice(-5).reverse().map(({ id, job }) =>
            <li key={id}><div><strong>{job.query}</strong><small>{categories[job.kind] ?? job.kind}</small></div><span>{job.status}</span></li>
          )}</ul>}
      </section>

      <section className="panel">
        <h2>Most-used sources</h2>
        <p>Local attempts as recorded by Tracelet.</p>
        {usageError ? <p role="status">Usage unavailable.</p> : !activeSources ? <p>Loading usage…</p> :
          !activeSources.length ? <p>No usage recorded yet.</p> :
          <dl className="dashboard-sources">{activeSources.slice(0, 5).map(row =>
            <div key={row.provider}><dt>{row.name}</dt><dd>{row.attempts} {row.unit ?? "requests"}</dd></div>
          )}</dl>}
      </section>
    </div>

    <div className="section-heading"><h2>Saved reports</h2></div>
    {history.length === recentReportLimit && <p>Showing the latest {recentReportLimit} saved reports.</p>}
    {historyError && <p role="alert">{historyError}</p>}
    {!historyLoaded ? <p>Loading saved reports…</p> : history.length ?
      <div className="report-history">{history.map(report =>
        <div className="report-history-row" key={report.id}>
          <Link href={`/report?archive=${report.id}`}>
            <span className="history-icon"><FileText size={18} /></span>
            <span><strong>{report.title || "Untitled report"}</strong><small>{report.count} searches · {new Date(report.updated).toLocaleDateString()}</small></span>
            <ArrowRight size={15} />
          </Link>
          <button className="icon-button" aria-label={"Delete saved report " + report.title} onClick={async () => {
            if (!window.confirm("Delete this saved report?")) return;
            setHistoryError("");
            try { await deleteReport(report.id); }
            catch (error) { setHistoryError((error as Error).message); }
          }}><Trash2 size={14} /></button>
        </div>
      )}</div> : <p>No saved reports yet.</p>}
  </div>;
}
