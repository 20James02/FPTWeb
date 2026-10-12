import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const tree = {
  mien_nam: {
    name: "Miền Nam",
    provinces: [
      { code: "province-a", name: "Tỉnh Đồng Nai", aliases: [] },
      {
        code: "province-b",
        name: "Thành phố Hồ Chí Minh",
        aliases: ["VN-SG", "Ho Chi Minh City"],
      },
    ],
  },
};
const place = {
  status: "estimated",
  country: "VN",
  source: "vercel",
  province_name: "Thành phố Hồ Chí Minh",
  subdivision_code: "VN-SG",
  city: "Ho Chi Minh City",
  ward_id: "forged-ward",
};
function fixture(saved = {}) {
  const pending = [],
    quoted = [],
    storage = new Map(Object.entries(saved)),
    events = new Map();
  function Option(name, value) {
    this.textContent = name;
    this.value = value;
    this.dataset = {};
  }
  const select = {
    options: [],
    selectedIndex: 0,
    replaceChildren(...rows) {
      this.options = rows;
      this.selectedIndex = 0;
    },
    append(row) {
      this.options.push(row);
    },
  };
  Object.defineProperty(select, "value", {
    get() {
      return this.options[this.selectedIndex]?.value || "";
    },
    set(value) {
      this.selectedIndex = this.options.findIndex((x) => x.value === value);
    },
  });
  const status = { textContent: "", hidden: true };
  const ward = {
    options: [],
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
  const context = vm.createContext({
    document: {
      addEventListener() {},
      getElementById(id) {
        return id === "home-province-select"
          ? select
          : id === "client-location-status"
            ? status
            : id === "home-ward-select"
              ? ward
              : null;
      },
    },
    Option,
    window: {
      addEventListener(type, callback) {
        events.set(type, callback);
      },
    },
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => storage.get(k) || "",
      setItem: (k, v) => storage.set(k, v),
    },
    fetch: (url) => new Promise((resolve) => pending.push({ url, resolve })),
    refreshCatalogPrices: (id) => quoted.push(id),
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/regions.js", "utf8"),
    context,
  );
  vm.runInContext(
    `cachedRegionsHierarchy=${JSON.stringify(tree)};clientWardCache.set('province-a',[]);clientWardCache.set('province-b',[]);`,
    context,
  );
  context.populateProvinceSelect(select, "mien_nam", "province-a");
  return { context, pending, quoted, storage, select, status, ward, events };
}
const { context: model } = fixture();
assert.equal(
  typeof model.matchIpProvince,
  "function",
  "Automatic IP-to-published-province matching is missing",
);
assert.equal(model.matchIpProvince(place, tree).id, "province-b");
assert.equal(model.matchIpProvince({ ...place, country: "US" }, tree), null);
assert.equal(
  model.matchIpProvince({ ...place, status: "unknown" }, tree),
  null,
);
assert.equal(
  model.matchIpProvince(
    { ...place, province_name: "Quảng Bình", subdivision_code: "VN-24" },
    tree,
  ),
  null,
  "A recognized but unavailable province must not fall back to another city",
);
const duplicate = structuredClone(tree);
duplicate.mien_nam.provinces[0].aliases = ["VN-SG"];
assert.equal(
  model.matchIpProvince(place, duplicate),
  null,
  "Ambiguous Admin aliases must not choose a pricing region",
);
assert.equal(
  model.matchIpProvince(
    {
      ...place,
      province_name: null,
      subdivision_code: null,
      city: "Ho Chi Minh City",
    },
    tree,
  ).id,
  "province-b",
);

{
  const f = fixture(),
    work = f.context.autoSelectClientLocation();
  assert.equal(f.pending[0].url, "/api/v1/regions/location-suggestion");
  f.pending[0].resolve({ ok: true, json: async () => place });
  await work;
  assert.equal(f.context.getSelectedRegionId(), "province-b");
  assert.deepEqual(
    f.quoted,
    ["province-b"],
    "The selected province must refresh catalog pricing",
  );
  assert.equal(
    f.storage.get("pagefpt_selected_province"),
    undefined,
    "IP estimate is not a customer-confirmed selection",
  );
  assert.match(f.status.textContent, /ước tính.*Hồ Chí Minh/i);
  assert.match(f.status.textContent, /xã\/phường/i);
  f.context.selectClientWard("confirmed-ward");
  assert.equal(
    f.storage.get("pagefpt_selected_province"),
    "province-b",
    "Choosing a ward must also save its inferred parent province",
  );
}
{
  const f = fixture({
    pagefpt_selected_province: "province-a",
    pagefpt_selected_ward: "customer-ward",
  });
  await f.context.autoSelectClientLocation();
  assert.equal(
    f.pending.length,
    0,
    "Saved customer geography takes precedence over IP",
  );
}
{
  const f = fixture(),
    work = f.context.autoSelectClientLocation();
  f.select.value = "province-a";
  await f.context.handleProvinceSelected(f.select);
  f.context.selectClientWard("customer-ward");
  f.pending[0].resolve({ ok: true, json: async () => place });
  await work;
  assert.equal(
    f.context.getSelectedRegionId(),
    "customer-ward",
    "Late lookup must preserve manual ward selection",
  );
  assert.equal(f.storage.get("pagefpt_selected_province"), "province-a");
}
{
  const f = fixture(),
    work = f.context.autoSelectClientLocation();
  f.pending[0].resolve({ ok: false });
  await work;
  assert.deepEqual(
    f.quoted,
    [],
    "Lookup failure must not change displayed pricing",
  );
}
{
  const f = fixture();
  f.context.document.body = { dataset: { landingPreview: "true" } };
  await f.context.autoSelectClientLocation();
  assert.equal(
    f.pending.length,
    0,
    "Admin preview must not infer the administrator's geography",
  );
}
{
  const f = fixture();
  let timeout;
  f.context.setTimeout = (fn) => {
    timeout = fn;
    return 1;
  };
  const work = f.context.autoSelectClientLocation();
  timeout();
  f.pending[0].resolve({ ok: true, json: async () => place });
  await work;
  assert.deepEqual(
    f.quoted,
    [],
    "A timed-out location response must not change prices",
  );
}
{
  const f = fixture();
  vm.runInContext("clientWardCache.delete('province-b')", f.context);
  const work = f.context.autoSelectClientLocation();
  f.pending[0].resolve({ ok: true, json: async () => place });
  await new Promise(setImmediate);
  assert.equal(f.pending.length, 2);
  f.events.get("pagehide")({ persisted: true });
  f.pending[1].resolve({
    ok: true,
    json: async () => ({
      items: [{ id: "restored-ward", name: "Phường kiểm thử" }],
      next_cursor: null,
    }),
  });
  await work;
  await f.events.get("pageshow")?.({ persisted: true });
  assert.equal(
    f.ward.disabled,
    false,
    "Back navigation must recover a ward selector whose response was fenced on pagehide",
  );
  assert.equal(f.ward.options[1]?.value, "restored-ward");
  assert.equal(
    f.status.hidden,
    false,
    "Back navigation must keep labeling the province as an IP estimate",
  );
  assert.equal(
    f.storage.get("pagefpt_selected_province"),
    undefined,
    "Restoring an estimated province must not classify it as customer-confirmed",
  );
}
{
  const f = fixture({
    pagefpt_selected_province: "province-a",
    pagefpt_selected_ward: "saved-ward",
  });
  vm.runInContext("clientWardCache.delete('province-a')", f.context);
  const initial = f.context.handleProvinceSelected(
    f.select,
    null,
    "saved-ward",
    "saved",
  );
  f.events.get("pagehide")({ persisted: true });
  f.pending[0].resolve({
    ok: true,
    json: async () => ({
      items: [{ id: "saved-ward", name: "Phường đã chọn" }],
      next_cursor: null,
    }),
  });
  await initial;
  await f.events.get("pageshow")({ persisted: true });
  assert.equal(
    f.context.getSelectedRegionId(),
    "saved-ward",
    "Back navigation must preserve a saved ward that was still loading",
  );
  assert.equal(f.storage.get("pagefpt_selected_ward"), "saved-ward");
}
console.log(
  "IP geography: unique published province only; saved/manual selection wins; prices refresh; estimates never claim a ward.",
);
