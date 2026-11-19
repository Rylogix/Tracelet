"use client";

import { useState } from "react";
import { analyzeEmailHeaders } from "./email-headers";
import { Button } from "./ui/button";

export function EmailHeaderAnalyzer() {
  const [headers, setHeaders] = useState("");
  const [result, setResult] = useState<ReturnType<typeof analyzeEmailHeaders>>();
  const [error, setError] = useState("");

  return <details className="panel email-header-analyzer">
    <summary>Email header analyzer</summary>
    <p id="email-header-help">Copy the original headers from your mail app and paste them here. Analysis stays in this browser tab.</p>
    <form onSubmit={event => {
      event.preventDefault();
      try {
        setResult(analyzeEmailHeaders(headers));
        setError("");
      } catch (error) {
        setResult(undefined);
        setError((error as Error).message);
      }
    }}>
      <label htmlFor="email-header-text">Original email headers</label>
      <textarea id="email-header-text" aria-describedby="email-header-help" className="paste-report"
        rows={7} value={headers} onChange={event => {
          setHeaders(event.target.value);
          setResult(undefined);
          setError("");
        }} spellCheck={false} autoComplete="off" required />
      <div className="actions">
        <Button>Analyze headers</Button>
        <Button type="button" variant="outline" disabled={!headers} onClick={() => {
          setHeaders("");
          setResult(undefined);
          setError("");
        }}>Clear</Button>
      </div>
    </form>
    {error && <p role="alert" className="error">{error}</p>}
    {result && <div className="email-header-results">
      <h2>Header analysis</h2>
      <dl>
        <dt>From</dt><dd>{result.from.filter(Boolean).join(" · ") || "Not present"}</dd>
        <dt>Reply-To</dt><dd>{result.replies.filter(Boolean).join(" · ") || "Not present"}</dd>
        <dt>Return-Path</dt><dd>{result.returnPath.filter(Boolean).join(" · ") || "Not present"}</dd>
      </dl>
      {result.replyDiffers && <p className="notice">Replies go to a different address than the one in From.</p>}
      <h3>Reported authentication</h3>
      <p>Read these as claims from the headers. Trust results only from mail servers you recognize.</p>
      {result.authentication.length ? <ul>{result.authentication.map(({ server, methods }, index) =>
        <li key={index}><strong>{server || "Reporting server unspecified"}</strong> {methods.map(({ method, result }) =>
          method + " " + result).join(" · ")}</li>
      )}</ul> : <p>No SPF, DKIM, or DMARC results found in Authentication-Results.</p>}
      {result.receivedSpf.length > 0 && <details className="compact-details">
        <summary>Received-SPF headers</summary>
        <ul>{result.receivedSpf.map((value, index) => <li key={index}>{value}</li>)}</ul>
      </details>}
      <h3>Mail route</h3>
      <p>Received headers in message order, usually newest first.</p>
      {result.route.length ? <ol>{result.route.map((hop, index) => <li key={index}>{hop}</li>)}</ol> :
        <p>No Received headers found.</p>}
    </div>}
  </details>;
}
