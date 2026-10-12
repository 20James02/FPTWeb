import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const pending = [];
const fields = new Map();
function field(id) {
  if (!fields.has(id))
    fields.set(id, {
      value: "",
      textContent: "",
      children: [],
      open: false,
      showModal() {
        this.open = true;
      },
      replaceChildren() {
        this.children = [];
      },
      append(...items) {
        this.children.push(...items);
      },
      querySelectorAll() {
        return [];
      },
      addEventListener() {},
    });
  return fields.get(id);
}
const context = vm.createContext({
  console,
  window: {},
  Set,
  Array,
  Number,
  Date,
  Option: function (name, value) {
    this.name = name;
    this.value = value;
  },
  document: {
    addEventListener(){},
    getElementById: field,
    createElement: () => ({ append() {} }),
    createTextNode: (text) => text,
  },
  $p: field,
  pricingClearError() {},
  pricingError() {
    throw new Error("Unexpected error");
  },
  pricingIdentity: { memberships: [{ branch_id: "zero", permissions: ["*"] }] },
  PRICING_ZERO: "zero",
  pricingNode: () => ({ append() {} }),
  pricingApi: () => new Promise((resolve) => pending.push(resolve)),
});
vm.runInContext(fs.readFileSync("src/pagefpt/static/js/dates_vn.js","utf8"),context);
context.PageFPTDates=context.window.PageFPTDates;
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/admin/geography.js", "utf8"),
  context,
);
vm.runInContext("geographySelectAll=()=>{};", context);
const snapshot = (name) => ({
  provinces: [{ code: 1, name, ward_count: 1 }],
  fetched_at: "2026-10-02T00:00:00Z",
  syncs: [],
});
const first = context.openGeographyDialog();
field("geography-dialog").open = false;
const second = context.openGeographyDialog();
pending[1](snapshot("New response"));
await second;
pending[0](snapshot("Old response"));
await first;
assert.equal(
  vm.runInContext("geographyPreview.provinces[0].name", context),
  "New response",
  "Late preview must not reset a reopened dialog",
);
console.log(
  "Geography preview: late responses do not overwrite reopened dialog",
);
assert.equal(
  context.geographySearchKey("Thành phố Đà Nẵng").includes("da nang"),
  true,
  "Uppercase Đ must match unaccented query",
);
context.pricingIdentity = null;
field("geography-dialog").open = false;
const earlyOpen = context.openGeographyDialog();
assert.equal(
  pending.length,
  4,
  "Opening before workspace hydration fetches identity independently",
);
pending[2](snapshot("Early response"));
pending[3]({
  memberships: [{ branch_id: "zero", permissions: ["catalog.write"] }],
});
await earlyOpen;
assert.equal(field("geography-branch").children[0].value, "zero");
