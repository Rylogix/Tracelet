import { json } from "./auth";
export const REPORT_BYTES = 1900000;
export function validateReport(value: any): string | null {
  if (!value || typeof value.title !== "string" || value.title.length > 120 || !Number.isInteger(value.revision) || !Array.isArray(value.entries) || value.entries.length > 100) return "Invalid report";
  const ids = new Set();
  for (const entry of value.entries) {
    const job = entry?.job;
    if (typeof entry?.id !== "string" || entry.id.length > 80 || ids.has(entry.id) || typeof entry.included !== "boolean" ||
      !job || typeof job.id !== "string" || typeof job.query !== "string" || job.query.length > 500 ||
      !["username","email","phone","file","website"].includes(job.kind) || typeof job.status !== "string" ||
      !Array.isArray(job.findings) || !Array.isArray(job.notes) || !Array.isArray(job.errors) || !Array.isArray(job.unavailable)) return "Invalid report entry";
    ids.add(entry.id);
    for (const item of job.findings) if (!item || typeof item.source !== "string" || typeof item.title !== "string" || typeof item.observed_at !== "string" || typeof item.confidence !== "string") return "Invalid finding";
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > REPORT_BYTES) return "Report is too large. Save this report and start another.";
  return null;
}
const snapshot = (row: any) => ({...JSON.parse(row.payload),id:row.id,title:row.title,created:row.created,updated:row.updated,revision:row.revision,archived:!!row.archived});
export async function reportRoutes(request: Request, db: D1Database, owner: string, path: string): Promise<Response | null> {
  if (path === "/api/workspace") {
    if (request.method === "GET") {
      const now = new Date().toISOString();
      await db.prepare("INSERT OR IGNORE INTO reports VALUES(?,?,?,?,?,?,0,0)").bind(crypto.randomUUID(),owner,"Untitled report",'{"entries":[]}',now,now).run();
      const row = await db.prepare("SELECT * FROM reports WHERE owner=? AND archived=0").bind(owner).first();
      return json(snapshot(row));
    }
    if (request.method === "PUT") {
      const value: any = await request.json(); const error = validateReport(value);
      if (error) return json({detail:error},422);
      const row = await db.prepare("UPDATE reports SET title=?,payload=?,updated=?,revision=revision+1 WHERE owner=? AND id=? AND archived=0 AND revision=? RETURNING *")
        .bind(value.title,JSON.stringify({entries:value.entries}),new Date().toISOString(),owner,value.id,value.revision).first();
      return row ? json(snapshot(row)) : json({detail:"This report changed in another tab. Reload before continuing."},409);
    }
  }
  if (path === "/api/reports" && request.method === "GET") return json((await db.prepare("SELECT id,title,created,updated,json_array_length(payload,'$.entries') AS count FROM reports WHERE owner=? AND archived=1 ORDER BY updated DESC LIMIT 100").bind(owner).all()).results);
  if (path === "/api/reports/archive" && request.method === "POST") {
    const body: any = await request.json();
    if (!body || typeof body.id !== "string" || !Number.isInteger(body.revision)) return json({detail:"Invalid report"},422);
    const row: any = await db.prepare("SELECT * FROM reports WHERE owner=? AND id=? AND archived=0 AND revision=?").bind(owner,body.id,body.revision).first();
    if (!row) return json({detail:"This report changed in another tab. Reload before continuing."},409);
    const entries = JSON.parse(row.payload).entries.filter((e: any) => e.included);
    if (!entries.length || entries.some((e: any) => ["queued","running"].includes(e.job.status))) return json({detail:"Finish your searches before saving the report."},422);
    const saved = await db.prepare("UPDATE reports SET archived=1,payload=?,updated=?,revision=revision+1 WHERE owner=? AND id=? AND archived=0 AND revision=? RETURNING id")
      .bind(JSON.stringify({entries}),new Date().toISOString(),owner,body.id,body.revision).first();
    return saved ? json(saved) : json({detail:"This report changed in another tab. Reload before continuing."},409);
  }
  const match = path.match(/^\/api\/reports\/([a-f0-9-]{36})$/);
  if (match) {
    if (request.method === "GET") {
      const row = await db.prepare("SELECT * FROM reports WHERE id=? AND owner=? AND archived=1").bind(match[1],owner).first();
      return row ? json(snapshot(row)) : json({detail:"Report not found"},404);
    }
    if (request.method === "DELETE") {
      await db.prepare("DELETE FROM reports WHERE id=? AND owner=? AND archived=1").bind(match[1],owner).run();return json({ok:true});
    }
  }
  return null;
}
