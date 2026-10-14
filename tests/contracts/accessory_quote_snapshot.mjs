import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const products = {
  textContent: JSON.stringify([
    {
      id: "device",
      name: "QA",
      price_vnd: 30000,
      original_price_vnd: 50000,
      billing_mode: "monthly",
    },
  ]),
};
const label = { dataset: { quotePlan: "plan" }, textContent: "" },
  handlers = {};
const base = {
  status: "confirmed",
  plan_id: "plan",
  billing_months: 6,
  monthly_vnd: 220000,
  initial_total_vnd: 1320000,
  accessory_ids: [],
  accessory_snapshot: [],
  accessory_monthly_vnd: 0,
  accessory_once_vnd: 0,
  revision: 10,
};
const fresh = {
  ...base,
  initial_total_vnd: 1560000,
  accessory_ids: ["device"],
  accessory_snapshot: [
    {
      id: "device",
      version: 4,
      name: "QA",
      price_vnd: 40000,
      original_price_vnd: 50000,
      offer_label: "Giá mới",
      billing_mode: "monthly",
    },
  ],
  accessory_monthly_vnd: 40000,
  revision: 11,
};
const context = vm.createContext({
  window: {},
  Intl,
  Date,
  AbortSignal,
  CustomEvent: class {},
  getSelectedRegionId: () => null,
  fetch: async () => ({ ok: true, json: async () => fresh }),
  document: {
    getElementById: (id) =>
      id === "published-accessories-data" ? products : null,
    querySelectorAll: (selector) =>
      selector === "[data-quote-plan]" ? [label] : [],
    dispatchEvent() {},
    addEventListener: (type, cb) => {
      handlers[type] = cb;
    },
  },
});
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/client/accessories.js", "utf8"),
  context,
);
const a = context.window.PageFPTAccessories;
a.acceptQuote("plan", base);
handlers.change({
  target: {
    matches: (s) => s === "[data-accessory-id]",
    dataset: { planId: "plan", accessoryId: "device" },
    checked: true,
  },
});
await new Promise((r) => setTimeout(r, 0));
assert.equal(
  a.parts("plan").monthly,
  40000,
  "Fresh authoritative device snapshot replaces page-load price",
);
assert.equal(a.total("plan"), 1560000, "UI total equals signed quote");
assert.equal(label.textContent, "260.000đ");
assert.equal(
  JSON.parse(products.textContent)[0].price_vnd,
  40000,
  "Details popup reads updated public price",
);
assert.equal(
  a.acceptQuote("plan", {
    ...fresh,
    revision: 10,
    accessory_snapshot: [{ ...fresh.accessory_snapshot[0], price_vnd: 30000 }],
    accessory_monthly_vnd: 30000,
    initial_total_vnd: 1500000,
  }),
  false,
  "Obsolete revision cannot restore stale prices",
);
assert.equal(a.total("plan"), 1560000);
console.log("Accessory authoritative snapshot and revision ordering PASS");

a.acceptQuote("plan", { ...fresh, billing_options: [fresh] });
a.acceptQuote("plan", { status: "not_available", revision: 12 });
assert.equal(
  a.current("plan"),
  null,
  "Unavailable plan cannot use earlier confirmed preview",
);
assert.equal(label.textContent, "Cần tư vấn");
const other = { ...base, plan_id: "other", revision: 12 };
a.acceptQuote("other", {
  ...other,
  billing_options: [{ ...other, billing_months: 1 }],
});
context.fetch = () => new Promise(() => {});
handlers.change({
  target: {
    matches: (s) => s === "[data-billing-months]",
    dataset: { billingMonths: "other" },
    value: "1",
  },
});
assert.equal(a.current("other").revision, 12);
a.acceptQuote("plan", { status: "not_available", revision: 13 });
assert.equal(
  a.current("other"),
  null,
  "New catalog revision invalidates orphan period previews",
);
console.log("Authoritative availability and orphan preview invalidation PASS");

const voucherQuote = { ...base, revision: 13, voucher: { status: 'eligible', discount_vnd: 100000 } };
a.acceptQuote('voucher-plan', { ...voucherQuote, plan_id: 'voucher-plan', billing_options: [{ ...voucherQuote, plan_id: 'voucher-plan', billing_months: 1 }] });
context.fetch = () => new Promise(() => {});
handlers.change({ target: { matches: s => s === '[data-accessory-id]', dataset: { planId: 'voucher-plan', accessoryId: 'device' }, checked: true } });
assert.equal(a.current('voucher-plan'), null, 'Changed devices must not reuse a voucher eligibility result for a different selection');
console.log('Voucher device changes invalidate both quote and period eligibility');
