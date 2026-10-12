const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  try {
    const p = await browser.newPage();
    await p.setContent(
      '<form id="form"><label>Date<input id="day" type="date" name="day" value="2026-10-08" required></label><label>Time<input id="time" type="datetime-local" value="2026-10-08T09:05" required></label></form>',
    );
    await p.addScriptTag({ path: "src/pagefpt/static/js/dates_vn.js" });
    await p.evaluate(() => PageFPTDates.enhance());
    assert.equal(
      await p
        .locator("#day")
        .evaluate((e) =>
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ).get.call(e),
        ),
      "08/10/2026",
    );
    await p.locator("#day").fill("31/02/2026");
    assert.equal(
      await p.locator("#day").evaluate((e) => e.checkValidity()),
      false,
    );
    await p.locator("#day").fill("29/02/2024");
    assert.equal(
      await p.locator("#day").evaluate((e) => e.value),
      "2024-02-29",
    );
    await p.evaluate(() => document.querySelector("form").reset());
    await p.waitForTimeout(50);
    assert.equal(
      await p
        .locator("#day")
        .evaluate((e) =>
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ).get.call(e),
        ),
      "08/10/2026",
    );
    await p.locator("#time").fill("08/10/2026 11:25");
    assert.equal(
      await p.locator("#time").evaluate((e) => e.value),
      "2026-10-08T11:25",
    );
    await p
      .locator(".date-native-picker")
      .first()
      .evaluate((e) => {
        e.value = "2027-01-31";
        e.dispatchEvent(new Event("change"));
      });
    assert.equal(
      await p.locator("#day").evaluate((e) => e.value),
      "2027-01-31",
    );
    console.log(
      "Date inputs: visible format, leap validation, reset, native picker and ISO values passed",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
