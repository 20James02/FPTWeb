const { chromium } = require("playwright"),
  assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox"],
  });
  try {
    const p = await b.newPage();
    await p.setContent(
      '<main class="admin-content"><table><thead><tr><th>Tên</th><th>Giá</th><th>Ngày</th></tr></thead><tbody><tr><td>Gói 10</td><td>1.200.000đ</td><td>02/01/2026</td></tr><tr><td>Gói 2</td><td>950.000đ</td><td>31/12/2025</td></tr></tbody></table></main>',
    );
    await p.addScriptTag({ path: "src/pagefpt/static/js/admin/list_tools.js" });
    await p.evaluate(() => PageFPTAdminLists.enhance());
    await p.getByRole("button", { name: "Giá ↕" }).click();
    assert.equal(
      await p.locator("tbody tr").first().textContent(),
      "Gói 2950.000đ31/12/2025",
    );
    await p.evaluate(() => PageFPTAdminLists.enhance());
    assert.equal(
      await p.locator("th").filter({ hasText: "Giá" }).textContent(),
      "Giá ↑",
    );
    await p.getByRole("button", { name: "Giá ↑" }).click();
    assert.equal(
      await p.locator("tbody tr").first().textContent(),
      "Gói 101.200.000đ02/01/2026",
    );
    await p.getByRole("button", { name: "Ngày ↕" }).click();
    assert.ok(
      (await p.locator("tbody tr").first().textContent()).includes(
        "31/12/2025",
      ),
    );
    console.log(
      "Stable table headings, numeric/date sort in both directions passed",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
