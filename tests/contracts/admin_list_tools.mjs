import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  "src/pagefpt/static/js/admin/list_tools.js",
  "utf8",
);
const ctx = { window: {}, document: { addEventListener() {} }, Intl, console };
vm.createContext(ctx);
vm.runInContext(source, ctx);
const { compareValues } = ctx.window.PageFPTAdminLists;
assert.ok(compareValues("1.200.000 ₫", "950.000 ₫", "money") > 0);
assert.ok(compareValues("31/12/2026 09:00", "02/01/2026 10:00", "date") > 0);
assert.ok(compareValues("Gói 10", "Gói 2", "text") > 0);
assert.equal(compareValues("—", "—", "money"), 0);
assert.ok(compareValues("—", "100", "money") > 0);
console.log("Admin typed sorting contract passed");
