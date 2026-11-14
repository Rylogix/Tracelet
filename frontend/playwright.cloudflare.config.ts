import { defineConfig } from "@playwright/test";
const proxyValue =
  process.env.TRACELET_BASE_URL &&
  (process.env.HTTPS_PROXY || process.env.HTTP_PROXY);
const proxyUrl = proxyValue ? new URL(proxyValue) : undefined;
const proxy = proxyUrl
  ? {
      server: proxyUrl.origin,
      ...(proxyUrl.username
        ? {
            username: decodeURIComponent(proxyUrl.username),
            password: decodeURIComponent(proxyUrl.password),
          }
        : {}),
    }
  : undefined;
export default defineConfig({
  testDir: "./tests-cloudflare",
  workers: 1,
  use: {
    baseURL: process.env.TRACELET_BASE_URL || "http://localhost:8787",
    proxy,
  },
  webServer: process.env.TRACELET_BASE_URL
    ? undefined
    : {
        command: "cd ../cloudflare && npm run dev",
        url: "http://localhost:8787",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
  projects: [
    {
      name: "hosted-desktop",
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "hosted-mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
