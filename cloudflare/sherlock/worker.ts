import { DurableObject } from "cloudflare:workers";
interface Env { SHERLOCK: DurableObjectNamespace<SherlockContainer> }
export class SherlockContainer extends DurableObject<Env> {
  private starting?: Promise<void>;
  private monitoring?: Promise<void>;
  private async ready() {
    const container = this.ctx.container!;
    if (!container.running) container.start({
      image: container.images.base, instance: "basic", enableInternet: true,
    });
    this.monitoring ??= container.monitor().catch(() => {}).finally(() => { this.monitoring = undefined; });
    this.ctx.waitUntil(this.monitoring);
    await container.setInactivityTimeout(210000);
    for (let i = 0; i < 100; i++) {
      try {
        const response = await container.getTcpPort(8080).fetch("http://container/health", {signal: AbortSignal.timeout(1000)});
        await response.body?.cancel();
        if (response.ok) return;
      } catch { /* Server still starting. */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("Sherlock did not become ready");
  }
  async fetch(request: Request) {
    this.starting ??= this.ready().finally(() => { this.starting = undefined; });
    await this.starting;
    const url = new URL(request.url); url.protocol = "http:"; url.host = "container";
    return this.ctx.container!.getTcpPort(8080).fetch(new Request(url, request));
  }
}
export default {
  async fetch(request: Request, env: Env) {
    const path = new URL(request.url).pathname;
    if (path !== "/health" && path !== "/jobs" && !/^\/jobs\/[a-f0-9-]{36}$/.test(path)) return new Response(null, {status:404});
    return env.SHERLOCK.getByName("singleton").fetch(request);
  }
};
