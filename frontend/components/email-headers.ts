export const maxHeaderLength = 65536;

const supported = new Set([
  "from", "reply-to", "return-path", "received", "authentication-results", "received-spf",
]);

function singleMailbox(value: string) {
  const match = value.match(/^(?:[^<>,]*<([^<>]+)>|([^<>,\s]+))$/);
  const address = match?.[1] ?? match?.[2];
  return address && /^[^@\s<>]+@[^@\s<>]+$/.test(address) ? address : undefined;
}

function authResults(value: string) {
  // Remove quoted strings and comments before interpreting semicolons.
  const cleaned = value.replace(/"(?:\\.|[^"\\])*"/g, '""');
  let depth = 0;
  let clauses = "";
  for (const char of cleaned) {
    if (char === "(") depth++;
    else if (char === ")" && depth) depth--;
    else if (!depth) clauses += char;
  }
  const [server, ...methods] = clauses.split(";");
  return {
    server: server.trim(),
    methods: methods.flatMap(clause => {
      const match = clause.match(/^\s*(spf|dkim|dmarc)(?:\/\d+)?\s*=\s*([a-z][a-z0-9_-]*)\b/i);
      return match ? [{ method: match[1].toUpperCase(), result: match[2].toLowerCase() }] : [];
    }),
  };
}

export function analyzeEmailHeaders(input: string) {
  const headerOnly = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/, 1)[0];
  if (headerOnly.length > maxHeaderLength) throw new Error("Paste up to 65,536 characters of message headers.");

  const fields = new Map<string, string[]>();
  let name = "";
  for (const line of headerOnly.split("\n")) {
    if (/^[ \t]/.test(line)) {
      const values = fields.get(name);
      if (values) values[values.length - 1] += " " + line.trim();
      continue;
    }
    const match = line.match(/^([!-9;-~]+):[ \t]*(.*)$/);
    name = match?.[1].toLowerCase() ?? "";
    if (!match || !supported.has(name)) continue;
    const value = match[2].trim();
    const values = fields.get(name);
    if (values) values.push(value);
    else fields.set(name, [value]);
  }
  if (![...fields.values()].some(values => values.some(Boolean)))
    throw new Error("No supported email headers found. Copy the original headers from your email app.");

  const from = fields.get("from") ?? [];
  const replies = fields.get("reply-to") ?? [];
  const sender = from.length === 1 ? singleMailbox(from[0]) : undefined;
  const reply = replies.length === 1 ? singleMailbox(replies[0]) : undefined;
  const replyDiffers = !!sender && !!reply && (
    sender.slice(0, sender.lastIndexOf("@")) !== reply.slice(0, reply.lastIndexOf("@")) ||
    sender.split("@").at(-1)?.toLowerCase() !== reply.split("@").at(-1)?.toLowerCase()
  );
  return {
    from, replies, replyDiffers,
    returnPath: fields.get("return-path") ?? [],
    route: fields.get("received") ?? [],
    authentication: (fields.get("authentication-results") ?? []).map(authResults).filter(entry => entry.methods.length),
    receivedSpf: fields.get("received-spf") ?? [],
  };
}
