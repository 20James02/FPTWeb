const { chromium, webkit, devices } = require("playwright");
const assert = require("node:assert/strict"),
  fs = require("node:fs");
const origin = process.env.PAGEFPT_QA_ORIGIN || "http://127.0.0.1:8098";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw Error("Loopback required");
(async () => {
  const checks = [];
  for (const browserType of process.env.PAGEFPT_QA_WEBKIT
    ? [webkit]
    : [chromium]) {
    const browser = await browserType.launch(
      browserType === chromium
        ? { executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }
        : {},
    );
    try {
      for (const mode of [
        "normal",
        "missing-bandwidth-timing",
        "restricted-timing",
        "blocked",
      ]) {
        const context = await browser.newContext({
          ...devices["iPhone 13"],
          defaultBrowserType: undefined,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors = [],
          warnings = [];
        let requests = 0;
        page.on("pageerror", (e) => errors.push(e.message));
        page.on("console", (m) => {
          if (m.type() === "warning") warnings.push(m.text());
        });
        if (mode !== "normal" && mode !== "blocked")
          await page.addInitScript(
            ({ mode }) => {
              const original = performance.getEntriesByName.bind(performance);
              performance.getEntriesByName = (url, ...args) => {
                if (!String(url).includes("speed.cloudflare.com"))
                  return original(url, ...args);
                const bytes = Number(new URL(url).searchParams.get("bytes"));
                if (mode === "missing-bandwidth-timing" && bytes > 0) return [];
                if (mode === "restricted-timing")
                  return original(url, ...args).map((p) => ({
                    startTime: p.startTime,
                    responseEnd: p.responseEnd,
                    requestStart: 0,
                    responseStart: 0,
                    transferSize: 0,
                  }));
                return original(url, ...args);
              };
            },
            { mode },
          );
        await page.route("**/*", async (r) => {
          const url = new URL(r.request().url());
          if (url.hostname === "speed.cloudflare.com") {
            requests++;
            if (mode === "blocked") return r.abort();
            const bytes = Number(url.searchParams.get("bytes") || 0);
            await new Promise((resolve) =>
              setTimeout(resolve, bytes > 0 ? 100 : 20),
            );
            return r.fulfill({
              status: 200,
              headers: {
                "access-control-allow-origin": "*",
                "timing-allow-origin": "*",
                "access-control-expose-headers": "server-timing",
                "server-timing": "cfReqDur;dur=1",
                "cache-control": "no-store",
              },
              body:
                r.request().method() === "POST" ? "" : Buffer.alloc(bytes, 65),
            });
          }
          return r
            .request()
            .url()
            .startsWith(origin + "/")
            ? r.continue()
            : r.abort();
        });
        await page.goto(origin + "/do-toc-do");
        assert.equal(requests, 0);
        await page.locator("#speedtest-start").click();
        await page.waitForFunction(
          () =>
            ["complete", "error"].includes(
              document.querySelector("#speedtest-console").dataset.state,
            ),
          null,
          { timeout: 40000 },
        );
        const state = await page
          .locator("#speedtest-console")
          .getAttribute("data-state");
        fs.mkdirSync(".local/qa/speedtest-mobile", { recursive: true });
        await page.screenshot({
          path:
            ".local/qa/speedtest-mobile/" +
            browserType.name() +
            "-" +
            mode +
            ".png",
          fullPage: true,
        });
        assert.equal(
          state,
          mode === "blocked" ? "error" : "complete",
          JSON.stringify({ mode, state, warnings }),
        );
        if (mode !== "blocked")
          for (const key of ["download", "upload", "latency"])
            assert.ok(
              Number(
                (await page.locator("#speed-" + key).textContent()).replace(
                  ",",
                  ".",
                ),
              ) > 0,
              key,
            );
        if (mode === "missing-bandwidth-timing" || mode === "restricted-timing")
          assert.ok((await page.locator('#speedtest-status').textContent()).includes('ước tính'), 'Fallback rates must disclose their measurement method');
        assert.deepEqual(errors, []);
        checks.push({ browser: browserType.name(), mode, state, requests });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    ".local/qa/speedtest-mobile/report-" +
      (process.env.PAGEFPT_QA_WEBKIT ? "webkit" : "chromium") +
      ".json",
    JSON.stringify(checks, null, 2),
  );
  console.log(checks);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
