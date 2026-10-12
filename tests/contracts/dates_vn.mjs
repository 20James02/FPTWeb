import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
const ctx = {
  window: {},
  document: { addEventListener() {} },
  Intl,
  Date,
  console,
};
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/dates_vn.js", "utf8"),
  ctx,
);
const d = ctx.window.PageFPTDates;
assert.equal(d.toISO("08/10/2026", "date"), "2026-10-08");
assert.equal(d.toISO("08/10/2026 09:05", "datetime-local"), "2026-10-08T09:05");
assert.equal(d.toISO("31/02/2026", "date"), "");
assert.equal(d.toISO("29/02/2024", "date"), "2024-02-29");
assert.equal(d.toDisplay("2026-01-02", "date"), "02/01/2026");
assert.equal(
  d.toDisplay("2026-10-08T09:05", "datetime-local"),
  "08/10/2026 09:05",
);
assert.match(d.format("2026-10-08T02:05:00Z"), /08\/10\/2026.*09:05/);
console.log("Vietnamese date conversion/validation/timezone passed");
