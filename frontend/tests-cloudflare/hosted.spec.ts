import { test, expect, type Page } from "@playwright/test";
test.beforeEach(async ({ context }) => {
  if (!process.env.TRACELET_BASE_URL)
    await context.setExtraHTTPHeaders({
      "CF-Connecting-IP": "192.0.2." + (1 + Math.floor(Math.random() * 254)),
    });
});
async function passkey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}
test("public passkey signup, private real search, signout and account isolation", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await passkey(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your best start in free OSINT." }),
  ).toBeVisible();
  if (process.env.TRACELET_SCREENSHOT)
    await page.screenshot({
      path:
        process.env.TRACELET_SCREENSHOT +
        "-signin-" +
        test.info().project.name +
        ".png",
      fullPage: true,
    });
  let registration: unknown;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/auth/register/verify"))
      registration = request.postDataJSON();
  });
  const name = "test-" + Date.now();
  await page.getByLabel("Choose your Tracelet username").fill(name);
  await page
    .getByRole("button", { name: "Create account with a passkey" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your free OSINT workspace.",
    }),
  ).toBeVisible({ timeout: 30000 });
  expect(
    (
      await page.request.post("/api/auth/register/verify", {
        headers: { "X-Tracelet-Client": "local-ui" },
        data: registration,
      })
    ).status(),
  ).toBe(400);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await page.getByLabel("Save to account", { exact: true }).check();
  await page.keyboard.press("Control+k");
  await expect(
    page.getByLabel("What would you like to investigate?"),
  ).toBeFocused();
  await page.getByRole("button", { name: "example.com", exact: true }).click();
  await expect(
    page.getByLabel("What would you like to investigate?"),
  ).toHaveValue("example.com");
  await page
    .getByLabel("What would you like to investigate?")
    .fill("+442079460018");
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await expect(page.getByText("Number format", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByText("United Kingdom", { exact: true })).toBeVisible();
  if (process.env.TRACELET_SCREENSHOT)
    await page.screenshot({
      path:
        process.env.TRACELET_SCREENSHOT +
        "-evidence-" +
        test.info().project.name +
        ".png",
      fullPage: true,
    });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const history = await page.request.get("/api/history");
  const jobs = await history.json();
  expect(jobs.length).toBe(1);
  const id = jobs[0].id;
  const key = "tracelet-test-credential-not-a-real-key";
  expect(
    (
      await page.request.put("/api/integrations/virustotal/key", {
        headers: { "X-Tracelet-Client": "local-ui" },
        data: { key },
      })
    ).status(),
  ).toBe(200);
  expect(
    await (await page.request.get("/api/integrations")).text(),
  ).not.toContain(key);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 3;
    c.height = 4;
    return c.toDataURL("image/png").split(",")[1];
  });
  const uploads: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/files")) uploads.push(r.url());
  });
  await page.getByLabel("Upload file for local analysis").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByText("Image properties", { exact: true })).toBeVisible(
    { timeout: 15000 },
  );
  expect(uploads).toHaveLength(0);
  const other = await browser.newContext({
    proxy: test.info().project.use.proxy,
    extraHTTPHeaders: process.env.TRACELET_BASE_URL
      ? {}
      : {
          "CF-Connecting-IP":
            "198.51.100." + (1 + Math.floor(Math.random() * 254)),
        },
  });
  const p = await other.newPage();
  await passkey(p);
  await p.goto("/");
  await p
    .getByLabel("Choose your Tracelet username")
    .fill("other-" + Date.now());
  await p
    .getByRole("button", { name: "Create account with a passkey" })
    .click();
  await expect(
    p.getByRole("heading", {
      name: "Your free OSINT workspace.",
    }),
  ).toBeVisible({ timeout: 30000 });
  expect((await p.request.get("/api/search/" + id)).status()).toBe(404);
  expect(await (await p.request.get("/api/history")).json()).toEqual([]);
  const providers = await (await p.request.get("/api/integrations")).json();
  expect(
    providers.find((i: { id: string }) => i.id === "virustotal").connected,
  ).toBe(false);
  expect(
    (
      await p.request.delete("/api/account", {
        headers: { "X-Tracelet-Client": "local-ui" },
      })
    ).status(),
  ).toBe(200);
  await other.close();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your best start in free OSINT." }),
  ).toBeVisible();
  expect((await page.request.get("/api/history")).status()).toBe(401);
  await page.getByRole("button", { name: "Sign in with your passkey" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your free OSINT workspace.",
    }),
  ).toBeVisible({ timeout: 30000 });
  if (process.env.TRACELET_SCREENSHOT)
    await page.screenshot({
      path:
        process.env.TRACELET_SCREENSHOT +
        "-" +
        test.info().project.name +
        ".png",
      fullPage: true,
    });
  for (const route of ["/usage", "/settings/integrations", "/footprint"]) {
    await page.goto(route);
    await expect(page.locator('[aria-current="page"]:visible')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (route === "/settings/integrations") {
      await page.getByRole("button", { name: /^Ready to use/ }).click();
      await expect(
        page.getByRole("button", { name: /^Ready to use/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("heading", { name: "VirusTotal", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: /^All tools/ }).click();
      await expect(
        page.getByRole("heading", { name: "VirusTotal", exact: true }),
      ).toBeVisible();
    }
    if (process.env.TRACELET_SCREENSHOT)
      await page.screenshot({
        path:
          process.env.TRACELET_SCREENSHOT +
          "-" +
          route.replaceAll("/", "-") +
          "-" +
          test.info().project.name +
          ".png",
        fullPage: true,
      });
  }
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { "X-Tracelet-Client": "local-ui" },
      })
    ).status(),
  ).toBe(200);
});
test("rejects unauthenticated mutations and cross-origin calls", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/search", { data: { query: "example.com" } })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/search", {
        headers: {
          "X-Tracelet-Client": "local-ui",
          Origin: "https://evil.example",
        },
        data: { query: "example.com" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/search", {
        headers: { "X-Tracelet-Client": "local-ui" },
        data: { query: "example.com" },
      })
    ).status(),
  ).toBe(401);
});

test("live hosted DNS and RDAP smoke", async ({ page }) => {
  test.skip(
    process.env.TRACELET_LIVE !== "1",
    "Explicit live provider check, excluded from deterministic CI",
  );
  test.setTimeout(60000);
  await passkey(page);
  await page.goto("/");
  await page
    .getByLabel("Choose your Tracelet username")
    .fill("live-" + Date.now());
  await page
    .getByRole("button", { name: "Create account with a passkey" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your free OSINT workspace.",
    }),
  ).toBeVisible();
  const result = await page.request.post("/api/search", {
    headers: { "X-Tracelet-Client": "local-ui" },
    data: { query: "example.com", history: false },
  });
  expect(result.status()).toBe(202);
  const initial = await result.json();
  let job = initial;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500);
    job = await (await page.request.get("/api/search/" + initial.id)).json();
    if (!["running", "queued"].includes(job.status)) break;
  }
  expect(
    (
      await page.request.delete("/api/account", {
        headers: { "X-Tracelet-Client": "local-ui" },
      })
    ).status(),
  ).toBe(200);
  expect(job.errors).toEqual([]);
  expect(
    job.findings.some(
      (f: { source: string }) => f.source === "Google Public DNS",
    ),
  ).toBe(true);
  expect(
    job.findings.some((f: { source: string }) => f.source === "RDAP"),
  ).toBe(true);
});
