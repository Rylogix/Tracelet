import type { Finding } from "./api";
export async function analyzeFile(file: File): Promise<Finding[]> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Maximum file size is 10 MB.");
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./file-worker.ts", import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("File analysis exceeded the 12-second safety limit."));
    }, 12000);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.findings);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error("File parser could not analyze this file."));
    };
    worker.postMessage({ buffer, name: file.name, type: file.type }, [buffer]);
  });
}
