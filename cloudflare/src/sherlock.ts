import { finding, type ProviderEnv, type Finding } from "./providers";
import type { ProfileCheck } from "./usernames";
export interface SherlockEnv extends ProviderEnv {
  SHERLOCK?: Fetcher;
  SHERLOCK_ENABLED?: string;
}
export interface SherlockJob {
  id: string; target: string; status: string; engine?: string;
  checks?: ProfileCheck[]; total: number; completed: number;
  findings: Finding[]; notes: string[];
}
export const sherlockEnabled = (env: SherlockEnv) => env.SHERLOCK_ENABLED === "true" && !!env.SHERLOCK;

function apply(job: SherlockJob, value: any) {
  if (!Number.isInteger(value.total) || value.total < 1 || value.total > 1000 || !Array.isArray(value.checks)) throw new Error("Invalid Sherlock response");
  job.engine = "sherlock";
  job.total = value.total;
  job.checks = value.checks.slice(0, value.total);
  job.completed = job.checks!.length;
  job.findings = job.checks!.filter(c => c.status === "found" && typeof c.url === "string" && c.url.startsWith("https://"))
    .map(c => finding("Sherlock · " + c.platform, "@" + job.target, {username:job.target}, c.url, "low"));
  job.status = value.status === "running" ? "running" : value.status === "cancelled" ? "cancelled" :
    value.status === "completed" && !job.checks!.some(c => c.status === "unavailable") ? "completed" : "partial";
  job.notes = ["Matching usernames do not establish identity.", ...(value.reason ? [String(value.reason)] : [])];
}
export async function startSherlock(env: SherlockEnv, owner: string, job: SherlockJob) {
  if (!sherlockEnabled(env)) throw new Error("Sherlock container is not enabled");
  // Atomic global daily scan cap and one-minute shared safety gate. These are
  // operator safety budgets, not provider-confirmed quota or a dollar cap.
  const bucket = "sherlock:" + new Date().toISOString().slice(0, 10);
  const count = await env.DB.prepare("INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count")
    .bind(bucket, Date.now() + 86400000).first<{count:number}>();
  if ((count?.count ?? 21) > 20) throw new Error("Sherlock daily safety budget reached");
  await env.DB.prepare("INSERT OR IGNORE INTO provider_locks(provider) VALUES('sherlock')").run();
  const lock = await env.DB.prepare("UPDATE provider_locks SET next_request=? WHERE provider='sherlock' AND next_request<=? RETURNING provider")
    .bind(Date.now()+60000,Date.now()).first();
  if (!lock) throw new Error("Sherlock is cooling down");
  await env.DB.prepare("INSERT INTO usage(owner,provider) VALUES(?,'sherlock') ON CONFLICT DO NOTHING").bind(owner).run();
  const reserved = await env.DB.prepare("UPDATE usage SET attempts=attempts+1,last_update=? WHERE owner=? AND provider='sherlock' AND (budget IS NULL OR attempts<budget) RETURNING attempts")
    .bind(new Date().toISOString(),owner).first();
  if (!reserved) throw new Error("Sherlock personal budget reached");
  try {
    const response = await env.SHERLOCK!.fetch("https://sherlock/jobs", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id:job.id,username:job.target}), signal:AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(response.status === 429 ? "Sherlock is busy" : "Sherlock unavailable");
    apply(job,await response.json());
    await env.DB.prepare("UPDATE usage SET successes=successes+1,last_success=? WHERE owner=? AND provider='sherlock'").bind(new Date().toISOString(),owner).run();
  } catch (e) {
    await env.DB.prepare("UPDATE usage SET failures=failures+1 WHERE owner=? AND provider='sherlock'").bind(owner).run();
    throw e;
  }
}
export async function refreshSherlock(env: SherlockEnv, job: SherlockJob) {
  if (!env.SHERLOCK) throw new Error("Sherlock unavailable");
  const response = await env.SHERLOCK.fetch("https://sherlock/jobs/"+job.id, {signal:AbortSignal.timeout(25000)});
  if (!response.ok) {job.status="partial";job.notes.push("Sherlock search interrupted");return;}
  apply(job,await response.json());
}
export async function cancelSherlock(env: SherlockEnv, id: string) {
  await env.SHERLOCK?.fetch("https://sherlock/jobs/"+id,{method:"DELETE",signal:AbortSignal.timeout(10000)});
}
