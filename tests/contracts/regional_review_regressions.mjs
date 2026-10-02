import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("Refreshing admin prices can resolve the same ward name again", async () => {
  const fields = new Map();
  const context = vm.createContext({
    console,
    Intl,
    Map,
    Set,
    AbortSignal,
    document: {
      addEventListener() {},
      getElementById(id) {
        if (!fields.has(id)) fields.set(id, { hidden: false, textContent: "" });
        return fields.get(id);
      },
    },
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/admin/pricing.js", "utf8"),
    context,
  );
  vm.runInContext(
    `
    const reviewWard = {
      id: 'ward-id', status: 'published',
      payload: { level: 'ward', parent_id: 'province-id', name: 'Phường kiểm thử' }
    };
    pricingApi = async path => {
      if (path.startsWith('/api/v1/admin/prices?')) return { items: [] };
      if (path === '/api/v1/admin/me') return { memberships: [] };
      if (path === '/api/v1/admin/regions/ward-id') return reviewWard;
      throw new Error('Unexpected review request: ' + path);
    };
    pricingAllPages = async () => [];
    getPricingWards = async parent => {
      pricingWards.set(parent, [reviewWard]);
      return [reviewWard];
    };
    fillProvinceSelect = () => {};
    renderPricing = () => {};
  `,
    context,
  );

  await context.loadPricesList();
  await context.resolvePricingLocation("ward-id");
  assert.equal(
    context.pricingLocation("ward-id")?.payload.name,
    "Phường kiểm thử",
  );

  // A successful save/publish calls this same refresh, which clears the ward cache.
  await context.loadPricesList();
  await context.resolvePricingLocation("ward-id");
  assert.equal(
    context.pricingLocation("ward-id")?.payload.name,
    "Phường kiểm thử",
    "Reloading must not leave previously resolved ward IDs permanently unresolved",
  );
});

test("Ward loading during landing submission does not permanently disable selection", async () => {
  const wards = deferred();
  const quote = deferred();
  class Option {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  }
  const ward = {
    value: "",
    disabled: true,
    options: [],
    replaceChildren(...options) {
      this.options = options;
    },
    append(...options) {
      this.options.push(...options);
    },
  };
  const fields = {
    "lp-phone": { value: "0901234567" },
    "lp-consent": { checked: true },
    "lp-plan": {
      value: "plan-id",
      disabled: false,
      options: [new Option("Gói kiểm thử", "plan-id")],
      selectedIndex: 0,
    },
    "lp-region": {
      value: "province-id",
      disabled: false,
      options: [new Option("Tỉnh kiểm thử", "province-id")],
      selectedIndex: 0,
    },
    "lp-ward": ward,
    "lp-quote": { textContent: "" },
  };
  const button = { disabled: false };
  const context = vm.createContext({
    console,
    Intl,
    AbortSignal,
    Option,
    document: { getElementById: (id) => fields[id], addEventListener() {} },
    isValidVietnamPhone: () => true,
    showToast() {},
    fetchLocationWards: () => wards.promise,
    getPublishedPlans: () => [{ id: "plan-id", service: "internet" }],
    submitLeadToBackend: async () => ({ receipt: "synthetic-receipt" }),
    openConfirmationModal() {},
    reviewPendingQuote: quote.promise,
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/landing.js", "utf8"),
    context,
  );
  vm.runInContext("refreshLandingQuote = () => reviewPendingQuote;", context);

  const loading = context.landingProvinceChanged();
  const submitting = context.handleDirectLeadSubmit({
    preventDefault() {},
    target: { querySelector: () => button },
  });
  assert.equal(
    ward.disabled,
    true,
    "Location is loading while the form is locked",
  );
  wards.resolve([{ id: "ward-id", name: "Phường kiểm thử" }]);
  await loading;
  assert.equal(
    ward.options.length,
    2,
    "The placeholder and loaded ward are present",
  );
  quote.resolve(null);
  await submitting;

  assert.equal(fields["lp-region"].disabled, false);
  assert.equal(
    ward.disabled,
    false,
    "Loaded wards must be selectable after the submit lock is released",
  );
});
