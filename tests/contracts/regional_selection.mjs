import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const options = {};
for (const id of ["home-ward-select", "form-lead-ward"])
  options[id] = {
    value: "",
    disabled: false,
    replaceChildren(...rows) {
      this.options = rows;
      this.value = rows[0]?.value || "";
    },
    append(row) {
      this.options.push(row);
    },
  };
const pending = [],
  notified = [],
  storage = new Map();
function Option(name, value) {
  this.textContent = name;
  this.value = value;
}
const context = vm.createContext({
  document: { addEventListener() {}, getElementById: (id) => options[id] },
  Option,
  AbortSignal,
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, v),
  },
  fetch: (url) => new Promise((resolve) => pending.push({ url, resolve })),
  refreshActiveQuote: (id) => notified.push(id),
});
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/client/regions.js", "utf8"),
  context,
);
vm.runInContext(
  "syncAllProvinceInputs=()=>{};syncSelectedProvinceToUI=()=>{};",
  context,
);
const select = (id) => ({
  selectedIndex: 0,
  options: [
    {
      value: id,
      textContent: id,
      dataset: { zoneId: "mien_bac", zoneName: "Miền Bắc" },
    },
  ],
});
const first = context.handleProvinceSelected(select("province-A"));
const second = context.handleProvinceSelected(select("province-B"));
assert.equal(context.getSelectedRegionId(), "province-B");
pending[1].resolve({
  ok: true,
  json: async () => ({
    items: [{ id: "ward-B", name: "Phường B" }],
    next_cursor: null,
  }),
});
await second;
context.selectClientWard("ward-B");
assert.equal(context.getSelectedRegionId(), "ward-B");
pending[0].resolve({
  ok: true,
  json: async () => ({
    items: [{ id: "ward-A", name: "Phường A" }],
    next_cursor: null,
  }),
});
await first;
assert.equal(context.getSelectedRegionId(), "ward-B");
assert.equal(options["home-ward-select"].options[1].value, "ward-B");
assert.equal(options["form-lead-ward"].value, "ward-B");
assert.deepEqual(Array.from(context.getSelectedRegionPath()), [
  "ward-B",
  "province-B",
]);
await context.handleProvinceSelected(select("province-A"));
assert.equal(context.getSelectedRegionId(), "province-A");
assert.equal(storage.get("pagefpt_selected_ward"), "");
assert.equal(
  pending.length,
  2,
  "Previously fetched ward catalog should be reused",
);
console.log(
  "Regional selection: late ward responses fenced; province fallback clears ward; cached lazy lookup.",
);
