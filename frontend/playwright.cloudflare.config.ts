import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-cloudflare",
  workers: 1,
  use: { baseURL: "http://localhost:8787" },
  webServer: {
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
