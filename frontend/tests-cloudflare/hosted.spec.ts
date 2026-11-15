import {zipSync,strToU8} from "fflate";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
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
  test.setTimeout(120000);
  await passkey(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Free OSINT." }),
  ).toBeVisible();
  await expect(page.getByText("Search public information and organize your findings into one report.",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Get started",exact:true}).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading",{name:"Sign in",exact:true})).toBeVisible();
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
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible({timeout:30000});
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link",{name:"Get started",exact:true})).toHaveCount(0);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link",{name:"API usage",exact:true})).toHaveCount(0);
  expect((await page.request.get("/usage")).status()).toBe(404);
  await page.getByRole("link",{name:"Website",exact:true}).first().click();
  await expect(page.getByRole("heading",{name:"Website",exact:true})).toBeVisible();
  const usageToggle=page.getByRole("button",{name:"Usage",exact:true});
  await expect(usageToggle).toHaveAttribute("aria-expanded","false");
  await expect(page.getByRole("button",{name:"DNS lookup usage",exact:true})).toBeHidden();
  await usageToggle.click();
  await expect(usageToggle).toHaveAttribute("aria-expanded","true");
  await page.getByRole("button",{name:"DNS lookup usage",exact:true}).click();
  await expect(page.locator(".usage-inline-metrics").getByText("Unknown",{exact:true}).first()).toBeVisible();
  await expect(page.locator(".usage-inline-panel").getByRole("meter")).toHaveCount(0);
  await page.getByLabel("DNS lookup local request budget").fill("10");
  await page.getByRole("button",{name:"Save budget",exact:true}).click();
  await expect(page.getByText("Budget saved",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"DNS lookup usage",exact:true})).toContainText("10 budget left");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.TRACELET_SCREENSHOT)await page.screenshot({path:process.env.TRACELET_SCREENSHOT+"-usage-"+test.info().project.name+".png",fullPage:true});
  await usageToggle.click();
  await expect(page.locator(".usage-inline-panel")).toBeHidden();
  if(process.env.TRACELET_SCREENSHOT)await page.screenshot({path:process.env.TRACELET_SCREENSHOT+"-usage-collapsed-"+test.info().project.name+".png",fullPage:true});
  await page.getByRole("link",{name:"Username",exact:true}).click();
  await expect(usageToggle).toHaveAttribute("aria-expanded","false");
  await usageToggle.click();
  await expect(page.getByRole("region",{name:"Lookup usage"})).toContainText("sources");
  await expect(page.getByRole("button",{name:"DNS lookup usage",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:/sources.*Local tracking/}).click();
  await expect(page.locator(".usage-source-list").getByRole("button",{name:/GitHub/})).toBeVisible();
  await page.locator(".usage-source-list").getByRole("button",{name:/GitHub/}).click();
  await expect(page.locator(".usage-inline-panel strong")).toHaveText("GitHub");

  expect(
    (
      await page.request.post("/api/auth/register/verify", {
        headers: { "X-Tracelet-Client": "local-ui" },
        data: registration,
      })
    ).status(),
  ).toBe(400);
  await expect(page.getByRole("link", { name: /footprint/i })).toHaveCount(0);
  expect((await page.request.get("/api/footprint")).status()).toBe(404);
  if(process.env.TRACELET_SCREENSHOT)await page.screenshot({path:process.env.TRACELET_SCREENSHOT+"-dashboard-"+test.info().project.name+".png",fullPage:true});
  await page.getByRole("link", { name: "Number", exact: true }).click();
  await expect(page.getByRole("region",{name:"Lookup usage"})).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Search",exact:true})).toBeEnabled();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Search", { exact: true })).toBeFocused();
  await page.getByLabel("Search", { exact: true }).fill("+442079460018");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Number format", { exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.getByRole("button",{name:"Expand Number format details",exact:true})).toHaveAttribute("aria-expanded","false");
  await page.getByRole("button",{name:"Expand Number format details",exact:true}).click();
  await expect(page.getByText("United Kingdom", { exact: true })).toBeVisible();
  await expect(page.getByText("E164",{exact:true})).toBeVisible();
  const card=page.locator(".finding-card").first();
  expect(await card.evaluate(e=>getComputedStyle(e).animationName)).toBe("evidence-arrive");
  await page.emulateMedia({reducedMotion:"reduce"});
  expect(await card.evaluate(e=>getComputedStyle(e).animationName)).toBe("none");
  await page.emulateMedia({reducedMotion:"no-preference"});

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
  await expect(page.getByRole("status")).toHaveText("Saved");
  const workspace = await (await page.request.get("/api/workspace")).json();
  expect(workspace.entries).toHaveLength(1);
  const id = workspace.entries[0].job.id;
  await page.getByLabel("Search", {exact:true}).fill("+12025550123");
  await page.getByRole("button", {name:"Search",exact:true}).click();
  await expect(page.getByRole("region", {name:"Number search: +12025550123"})).toBeVisible();
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
  await page.getByRole("link", {name:"Files",exact:true}).click();
  await page.getByLabel("Upload file for local analysis").setInputFiles({
    name: "café.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByText("Image properties", { exact: true })).toBeVisible(
    { timeout: 15000 },
  );
  expect(uploads).toHaveLength(0);
  await page.locator("main").getByRole("link",{name:"Report",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Report",exact:true})).toBeVisible();
  await expect(page.locator('a[aria-current="page"]:visible')).toHaveText(/^Report/);
  await expect(page.locator(".workflow-entry")).toHaveCount(3);
  await page.getByLabel("Report title").fill("Workflow α case");
  await page.getByRole("button",{name:"Remove +12025550123 from report",exact:true}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await page.getByRole("link",{name:"Number",exact:true}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"Add +12025550123 to report",exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Report",exact:true}).last().click();
  await expect(page.locator('a[aria-current="page"]:visible')).toHaveText(/^Report/);
  if(process.env.TRACELET_SCREENSHOT){await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));await page.screenshot({path:process.env.TRACELET_SCREENSHOT+"-report-"+test.info().project.name+".png",fullPage:false});}
  const textDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"TXT",exact:true}).click();
  const text=readFileSync((await (await textDownload).path())!,"utf8");
  expect(text).toContain("+442079460018");expect(text).toContain("café.png");expect(text).not.toContain("+12025550123");expect(text).not.toContain(key);
  const pdfDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"PDF",exact:true}).click();
  const bytes=readFileSync((await (await pdfDownload).path())!);expect(bytes.subarray(0,5).toString()).toBe("%PDF-");
  const pdf=await PDFDocument.load(bytes);expect(pdf.getPageCount()).toBeGreaterThanOrEqual(4);expect(pdf.getTitle()).toBe("Workflow α case");
  expect(pdf.getPages().some(p=>(p.node.Annots()?.size()||0)>0)).toBe(true);
  await page.context().grantPermissions(["clipboard-read","clipboard-write"]);
  await page.getByRole("button",{name:"Copy",exact:true}).click();
  await expect(page.getByRole("button",{name:"Copied",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toContain("café.png");
  await expect(page.getByRole("status")).toHaveText("Saved");
  await page.reload();await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await page.getByRole("button",{name:"Save to history & clear",exact:true}).click();
  await expect(page.getByText("Saved to history",{exact:true})).toBeVisible();
  await expect(page.locator(".workflow-entry")).toHaveCount(0);
  const reports=await (await page.request.get("/api/reports")).json();expect(reports).toHaveLength(1);
  const reportId=reports[0].id;
  await page.getByRole("link",{name:"Dashboard",exact:true}).click();
  await page.getByRole("link",{name:/Workflow α case/}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await expect(page.getByRole("button",{name:/Remove .* from report/})).toHaveCount(0);

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
  await p.goto("/login");
  await p.getByRole("button", { name: "Create account", exact: true }).click();
  await p.getByLabel("Username", { exact: true }).fill("other-" + Date.now());
  await p.getByRole("button", { name: "Create account" }).click();
  await expect(p.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible({timeout:30000});
  expect((await p.request.get("/api/search/" + id)).status()).toBe(404);
  expect((await p.request.get("/api/reports/"+reportId)).status()).toBe(404);
  expect((await (await p.request.get("/api/workspace")).json()).entries).toEqual([]);
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
    page.getByRole("heading", { name: "Free OSINT." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  expect((await page.request.get("/api/history")).status()).toBe(401);
  await page.getByRole("link",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Sign in",exact:true})).toBeVisible();
  const loginOptions=page.waitForResponse(r=>r.url().endsWith("/api/auth/login/options"));
  await page.getByRole("button", { name: "Sign in" }).click();
  if((await loginOptions).status()===429){
    await page.waitForTimeout(61000-(Date.now()%60000));
    await page.getByRole("button", {name:"Sign in",exact:true}).click();
  }
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible({timeout:30000});
  if (process.env.TRACELET_SCREENSHOT)
    await page.screenshot({
      path:
        process.env.TRACELET_SCREENSHOT +
        "-" +
        test.info().project.name +
        ".png",
      fullPage: true,
    });
  for (const route of ["/settings/integrations"]) {
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
test("office document metadata stays in the browser",async({page})=>{
 await passkey(page);await page.goto("/login");await page.getByRole("button",{name:"Create account",exact:true}).click();await page.getByLabel("Username",{exact:true}).fill("office-"+Date.now());await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Files",exact:true}).click();
 const bytes=zipSync({'docProps/core.xml':strToU8('<cp:coreProperties><dc:title>Document fixture</dc:title><dc:creator>Test author</dc:creator></cp:coreProperties>'),'docProps/app.xml':strToU8('<Properties><Application>Test editor</Application><Words>123</Words></Properties>')});
 const uploads:string[]=[];page.on('request',r=>{if(r.url().includes('/api/files'))uploads.push(r.url())});
 await page.getByLabel("Upload file for local analysis").setInputFiles({name:"fixture.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",buffer:Buffer.from(bytes)});
 await expect(page.getByText("Document properties",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Expand Document properties details",exact:true}).click();await expect(page.getByText("Test author",{exact:true})).toBeVisible();await expect(page.getByText("Test editor",{exact:true})).toBeVisible();expect(uploads).toEqual([]);
 await page.request.delete('/api/account',{headers:{'X-Tracelet-Client':'local-ui'}});
});

test("guest homepage leads to sign-in and protects the dashboard",async({page})=>{
 const workspaceRequests:string[]=[];
 page.on("request",r=>{if(r.url().endsWith("/api/workspace"))workspaceRequests.push(r.url())});
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Free OSINT.",exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:"Get started",exact:true})).toHaveAttribute("href","/login");
 await expect(page.getByRole("navigation",{name:"Main navigation"})).toHaveCount(0);
 expect(workspaceRequests).toEqual([]);
 if(process.env.TRACELET_SCREENSHOT)await page.screenshot({path:process.env.TRACELET_SCREENSHOT+"-home-"+test.info().project.name+".png",fullPage:true});
 await page.goto("/dashboard");
 await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole("heading",{name:"Sign in",exact:true})).toBeVisible();
 expect(workspaceRequests).toEqual([]);
 await page.goto("/");
 await page.getByRole("link",{name:"Sign in",exact:true}).click();
 await expect(page).toHaveURL(/\/login$/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
  test.setTimeout(120000);
  await passkey(page);
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Username", { exact: true }).fill("live-" + Date.now());
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading",{name:"Dashboard",exact:true})).toBeVisible({timeout:30000});
  async function searchTab(label:string, query:string) {
    await page.getByRole("link",{name:label,exact:true}).click();
    await expect(page.getByRole("heading",{name:label,exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Search",exact:true})).toBeEnabled();
    await page.getByLabel("Search",{exact:true}).fill(query);
    await page.getByRole("button",{name:"Search",exact:true}).click();
    let value:any;
    await expect.poll(async()=>{
      const workspace=await (await page.request.get("/api/workspace")).json();
      value=workspace.entries.find((e:any)=>e.job.query===query)?.job;
      return value && !["queued","running"].includes(value.status);
    },{timeout:50000,intervals:[1500]}).toBe(true);
    return value;
  }
  const job=await searchTab("Website","example.com");
  expect(job.findings.filter((f:{source:string})=>f.source==="Google Public DNS")).toHaveLength(8);
  expect(job.findings.some((f:{source:string})=>f.source==="Team Cymru DNS")).toBe(true);
  expect(job.findings.find((f:{source:string})=>f.source==="RDAP").value.registered).toBeTruthy();
  const mail=await searchTab("Email","tracelet-fixture@gmail.com");
  expect(mail.findings.some((f:{title:string,value:any})=>f.title==="SPF & DMARC"&&f.value.dmarc_records.length>0)).toBe(true);

  const scan=await searchTab("Username","octocat");
  expect(scan.total).toBe(29);expect(scan.checks).toHaveLength(29);
  expect(scan.findings.length).toBeGreaterThan(0);
  await expect(page.locator(".finding-pill")).toHaveCount(scan.findings.length);
  const first=scan.findings[0];
  const profileLink=page.getByRole("link",{name:"Open "+first.source+" profile",exact:true});
  await expect(profileLink).toHaveAttribute("href",first.evidence);
  await expect(profileLink).toHaveAttribute("target","_blank");
  const toggle=page.getByRole("button",{name:"Expand "+first.source+" details",exact:true});
  await expect(toggle).toHaveAttribute("aria-expanded","false");
  await toggle.click();
  await expect(page.getByRole("button",{name:"Collapse "+first.source+" details",exact:true})).toHaveAttribute("aria-expanded","true");
  await page.getByRole("button",{name:"Collapse "+first.source+" details",exact:true}).click();
  const columns=await page.locator(".finding-pill").evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,width:n.getBoundingClientRect().width})));
  expect(new Set(columns.map(c=>Math.round(c.x))).size).toBe(1);
  expect(new Set(columns.map(c=>Math.round(c.width))).size).toBe(1);

  expect(scan.findings.some((f:{value:any})=>f.value.bio||f.value.created_at||typeof f.value.followers==='number')).toBe(true);
  const github=scan.checks.find((c:{provider:string})=>c.provider==="github");
  expect(["found","unavailable"]).toContain(github.status);
  console.info("Live username checks:",scan.findings.length,"matches; GitHub:",github.status,github.reason||"");
  await searchTab("Username","torvalds");
  await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await page.locator("main").getByRole("link",{name:"Report",exact:true}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(4);
  await page.getByRole("button",{name:"Remove tracelet-fixture@gmail.com from report",exact:true}).click();
  await page.getByRole("button",{name:"Remove torvalds from report",exact:true}).click();
  await page.getByRole("button",{name:"Remove example.com from report",exact:true}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(1);
  await page.getByRole("link",{name:"Username",exact:true}).click();
  await expect(page.locator(".workflow-entry")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"Add torvalds to report",exact:true})).toBeVisible();
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
