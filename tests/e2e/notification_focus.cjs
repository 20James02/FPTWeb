const { chromium } = require("playwright"),
  assert = require("node:assert/strict"),
  fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<button id="admin-notices-button">Nhắc hạn <span id="admin-notices-count"></span></button>',
    );
    await page.addScriptTag({
      content: `
    window.adminHasPermission=()=>true;
    window.adminNode=(tag,text,cls='')=>{const n=document.createElement(tag);n.textContent=text??'';n.className=cls;return n;};
    window.adminMoney=v=>String(v);
    window.showToast=()=>{};
    const notice={id:'00000000-0000-0000-0000-000000000010',lead_id:'00000000-0000-0000-0000-000000000011',plan_name:'Test',amount_vnd:220000,due_date:'2026-10-07',read_at:null};
    window.crmRequest=async(path)=>{if(path.endsWith('/read'))notice.read_at='2026-10-07';return {items:window.removeNotice?[]:[{...notice}],unread_count:notice.read_at?0:1};};
  `,
    });
    await page.addScriptTag({
      content: fs.readFileSync(
        "src/pagefpt/static/js/admin/notifications.js",
        "utf8",
      ),
    });
    await page.evaluate(() =>
      document.dispatchEvent(new Event("DOMContentLoaded")),
    );
    await page.locator("#admin-notices-button").click();
    await page.locator("dialog[open]").waitFor();
    const focused = await page.evaluate(async () => {
      const link = document.querySelector("dialog a");
      link.focus();
      await refreshAdminPaymentNotices();
      return {
        connected: link.isConnected,
        same: document.activeElement === link,
      };
    });
    assert.deepEqual(focused, { connected: true, same: true });
    await page
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .focus();
    await page
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await page.waitForFunction(() =>
      document.querySelector("dialog").textContent.includes("Đã đọc"),
    );
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Xem hồ sơ",
    );
    await page.evaluate(async () => {
      window.removeNotice = true;
      await refreshAdminPaymentNotices();
    });
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent),
      "Làm mới",
    );
    console.log(
      "Inbox refresh preserves focus; acknowledged control moves focus to the same customer link.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
