import { it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { createReportPdf } from "../../frontend/components/report-pdf";
import { PDFDocument } from "../../frontend/node_modules/pdf-lib/es/index.js";
import type { Entry, Report } from "../../frontend/components/workflow";

const time = "2026-11-14T16:00:00.000Z";
const entry = (id: string, kind: string, query: string): Entry => ({
  id, included: true,
  job: { id, kind, query, status: "completed", completed: 2, total: 3, findings: [], notes: [], errors: [], unavailable: [] },
});
const font = (name: string) => new Uint8Array(readFileSync(new URL(`../../frontend/public/fonts/${name}.ttf`, import.meta.url)));
const options = { regular: font("report"), bold: font("report-bold"), generated: new Date(time) };
const report: Report = { id: "sample", title: "Findings — α", created: time, updated: time, revision: 1, entries: [] };
const profile = entry("profile", "username", "design-test-fixture");
profile.job.findings = [{
  source: "Profile API fixture", title: "@design-test-fixture", observed_at: time, confidence: "low",
  evidence: "https://example.com/profile",
  value: { username: "design-test-fixture", bio: "Public biography. ".repeat(170) + "FINAL BIO MARKER", followers: 0 },
}];
profile.job.checks = Array.from({ length: 100 }, (_, i) => ({ provider: "fixture", platform: "Omitted check " + i, status: "unavailable" }));

it("fits a few findings on one page and links to their sources without attaching raw data", async () => {
  const website = entry("website", "website", "example.com");
  website.job.findings = [{
    source: "DNS fixture", title: "A records", observed_at: time, confidence: "high",
    evidence: "https://dns.google/query?name=example.com&type=A",
    value: { answers: [{ value: "192.0.2.1", ttl_seconds: 300 }] },
  }];
  const excluded = { ...profile, id: "excluded", included: false };
  const bytes = await createReportPdf({ ...report, entries: [profile, website, excluded] }, options);
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getTitle()).toBe("Findings — α");
  expect(pdf.getPage(0).node.Annots()?.size()).toBe(2);
  expect(pdf.catalog.toString()).not.toContain("/EmbeddedFiles");
  if (process.env.TRACELET_PDF_PREVIEW === "1") writeFileSync("/tmp/tracelet-findings.pdf", bytes);
});

it("handles empty reports and paginates when findings fill the page", async () => {
  const empty = await PDFDocument.load(await createReportPdf(report, options));
  expect(empty.getPageCount()).toBe(1);
  const many = { ...profile, job: { ...profile.job, findings: Array(16).fill(profile.job.findings[0]) } };
  const pdf = await PDFDocument.load(await createReportPdf({ ...report, entries: [many] }, options));
  expect(pdf.getPageCount()).toBeGreaterThan(1);
  expect(pdf.getPageCount()).toBeLessThan(5);
  expect(pdf.getPages().reduce((sum, page) => sum + (page.node.Annots()?.size() ?? 0), 0)).toBe(16);
});
