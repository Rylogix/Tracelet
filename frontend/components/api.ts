export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "X-Tracelet-Client": "local-ui",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Request failed. Check your input and try again.",
    );
  }
  return response.json();
}
export function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export type Integration = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  connected: boolean;
  credential: boolean;
  status: string;
  free_tier?: boolean;
  registration?: string;
  docs: string;
  quota_reporting: string;
  rate: number | null;
};
export type Finding = {
  source: string;
  title: string;
  value: unknown;
  evidence?: string;
  confidence: string;
  observed_at: string;
};
export type Job = {
  id: string;
  query: string;
  kind: string;
  status: string;
  findings: Finding[];
  notes: string[];
  errors: { source: string; message: string }[];
  unavailable: { name: string; reason: string }[];
  completed: number;
  total: number;
  checks?: {
    provider: string;
    platform: string;
    status: string;
    reason?: string;
  }[];
};
