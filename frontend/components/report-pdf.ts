import { PDFDocument, PDFString, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Finding } from "./api";
import type { Report } from "./workflow";

const width = 595.28, height = 841.89, margin = 44;
const contentWidth = width - 2 * margin;
const ink = rgb(.12, .12, .13), muted = rgb(.36, .38, .42), blue = rgb(.14, .31, .59);
const categories: Record<string, string> = {
  username: "Username", email: "Email", phone: "Number", file: "File", website: "Website",
};

type Options = { regular: Uint8Array; bold: Uint8Array; generated?: Date };
const label = (key: string) => key.replace(/[_-]/g, " ").replace(/^./, c => c.toUpperCase());
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const short = (value: string, max = 150) => {
  const chars = Array.from(value.replace(/\s+/g, " ").trim().slice(0, max * 2));
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : chars.join("");
};

function observation(value: unknown): string {
  if (typeof value === "string") return short(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const items = value.slice(0, 4).map(item => {
      const detail = record(item);
      return observation(detail.value ?? detail.data ?? item);
    }).filter(Boolean);
    return items.length ? short(items.join(", ") + (value.length > 4 ? ", …" : "")) : "";
  }
  return "";
}

function findingDetails(finding: Finding): string[] {
  const value = record(finding.value);
  const metadata = record(value.document_metadata);
  const image = record(value.metadata);
  const route = record(Array.isArray(value.routes) ? value.routes[0] : undefined);
  const selected: Record<string, unknown> = {
    ...value,
    asn: value.asn ?? route.asn,
    prefix: value.prefix ?? route.prefix,
    author: value.author ?? metadata.author ?? metadata.creator ?? image.Artist,
    title: value.title ?? metadata.title,
    camera: [image.Make, image.Model].map(observation).filter(Boolean).join(" "),
  };
  const fields = [
    "name", "login", "username", "handle", "bio", "blog", "url", "profile_url",
    "international", "country", "type", "valid", "possible",
    "captured_at", "issuer", "valid_from", "valid_until", "certificate_names",
    "domain", "breach_date", "exposed_data_types", "scope",
    "answers", "response", "registrar", "registered", "expires", "status", "nameservers",
    "mx_records", "spf_records", "dmarc_policy", "mta_sts_records", "tls_reporting_records",
    "ip", "network_name", "asn", "prefix", "organization", "reputation",
    "declared_type", "mime_type", "width", "height", "title", "author", "camera", "creation_date", "sha256",
  ];
  const details = fields.flatMap(key => {
    const summary = observation(selected[key]);
    return summary ? [`${label(key)}: ${summary}`] : [];
  }).slice(0, 5);
  if (!details.length) {
    const summary = observation(finding.value) || observation(finding.evidence);
    if (summary && !/^https?:\/\//i.test(summary)) details.push(summary);
  }
  return details;
}

export async function createReportPdf(report: Report, options: Options): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(options.regular, { subset: true });
  const bold = await pdf.embedFont(options.bold, { subset: true });
  const chars = new Map([regular, bold].map(font => [font, new Set(font.getCharacterSet())]));
  const safe = (text: string, font: PDFFont) => Array.from(text, char =>
    chars.get(font)!.has(char.codePointAt(0)!) ? char : "�").join("");
  function wrap(text: string, size: number, font: PDFFont) {
    const lines: string[] = [];
    let line = "";
    for (const word of safe(text, font).split(" ")) {
      if (line && font.widthOfTextAtSize(line + " " + word, size) > contentWidth) {
        lines.push(line);
        line = "";
      }
      if (line) line += " ";
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > contentWidth) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  let page = pdf.addPage([width, height]);
  let y = height - margin;
  function draw(text: string, size = 10, font = regular, color = ink) {
    page.drawText(text, { x: margin, y, size, font, color });
    y -= size + 5;
  }
  function block(text: string, size: number, font = regular, color = ink) {
    wrap(text, size, font).forEach(line => draw(line, size, font, color));
  }
  function reserve(space: number) {
    if (y - space >= margin) return false;
    page = pdf.addPage([width, height]);
    y = height - margin;
    draw("TRACELET REPORT", 9, bold, muted);
    y -= 10;
    return true;
  }
  function sourceLink(finding: Finding) {
    if (!finding.evidence) return;
    let url: URL;
    try { url = new URL(finding.evidence); }
    catch { return; }
    if (!["http:", "https:"].includes(url.protocol)) return;
    const text = safe("Open source · " + short(url.hostname, 65), regular);
    const rect = [margin, y - 2, margin + regular.widthOfTextAtSize(text, 9), y + 10];
    page.node.addAnnot(pdf.context.register(pdf.context.obj({
      Type: "Annot", Subtype: "Link", Rect: rect, Border: [0, 0, 0],
      A: { S: "URI", URI: PDFString.of(url.href) },
    })));
    draw(text, 9, regular, blue);
  }

  const generated = options.generated ?? new Date();
  const title = report.title || "Untitled report";
  draw("TRACELET REPORT", 9, bold, muted);
  block(short(title), 24, bold);
  draw(new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(generated), 9, regular, muted);
  y -= 18;
  const entries = report.entries.filter(entry => entry.included);
  if (!entries.length) draw("No searches included.");
  for (const { job } of entries) {
    const heading = `${categories[job.kind] ?? label(job.kind)} · ${short(job.query, 110)}`;
    const headingSpace = wrap(heading, 14, bold).length * 19 + 8;
    const status = !job.findings.length ? "No findings returned." :
      job.status !== "done" && job.status !== "completed" ? `Search status: ${label(job.status)}` : "";
    if (!job.findings.length) {
      reserve(headingSpace + 16);
      block(heading, 14, bold);
      draw(safe(status, regular), 9, regular, muted);
      y -= 8;
    }
    job.findings.forEach((finding, index) => {
      const findingTitle = short(finding.title);
      const source = short(finding.source + (finding.confidence === "low" ? " · Low confidence" : ""), 100);
      const details = findingDetails(finding).flatMap(detail => wrap(detail, 10, regular));
      const space = wrap(findingTitle, 11, bold).length * 16 + wrap(source, 9, regular).length * 14
        + details.length * 15 + 14;
      const moved = reserve(space + headingSpace + (index === 0 && status ? 14 : 0));
      if (index === 0 || moved) {
        block(heading, 14, bold);
        if (index === 0 && status) draw(safe(status, regular), 9, regular, muted);
        y -= 4;
      }
      block(findingTitle, 11, bold);
      block(source, 9, regular, muted);
      details.forEach(line => draw(line));
      sourceLink(finding);
      y -= 9;
    });
    y -= 12;
  }
  pdf.setTitle(title);
  pdf.setCreator("Tracelet");
  pdf.setSubject("Public-source investigation report");
  pdf.setCreationDate(generated);
  return pdf.save();
}
