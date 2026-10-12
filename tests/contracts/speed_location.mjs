import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
function harness() {
  const status = { textContent: "" },
    button = { hidden: true, disabled: false, addEventListener() {} },
    timers = new Map(),
    callbacks = [],
    requests = [];
  const document = {
    getElementById: (id) => (id === "speed-location-status" ? status : button),
    addEventListener() {},
  };
  const window = { isSecureContext: true, addEventListener() {} };
  const context = vm.createContext({
    window,
    document,
    navigator: {
      geolocation: {
        getCurrentPosition: (ok, fail) => callbacks.push({ ok, fail }),
      },
    },
    URL,
    AbortController,
    setTimeout: (fn, delay) => {
      const id = Symbol();
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, options) =>
      new Promise((resolve) => requests.push({ url, options, resolve })),
    fetchRegionsHierarchy: async () => ({
      nam: {
        provinces: [
          { name: "Tỉnh kiểm thử", code: "province", zone_id: "nam" },
        ],
      },
    }),
    fetchLocationWards: async () => [{ id: "ward", name: "Phường kiểm thử" }],
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/speed_model.js", "utf8"),
    context,
  );
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/speed_location.js", "utf8"),
    context,
  );
  return {
    api: window.PageFPTSpeedLocation,
    status,
    button,
    timers,
    callbacks,
    requests,
  };
}
const position = (latitude) => ({
  coords: { latitude, longitude: 107.08, accuracy: 50 },
});
const place = {
  countryCode: "VN",
  lookupSource: "reverseGeocoding",
  principalSubdivision: "Tỉnh kiểm thử",
  locality: "Phường kiểm thử",
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("Late permission for current run remains useful after the waiting message", async () => {
  const h = harness();
  h.api.begin();
  [...h.timers.values()].find((t) => t.delay === 8000).fn();
  assert.match(h.status.textContent, /Chưa nhận/);
  h.callbacks[0].ok(position(10.35));
  assert.equal(h.requests.length, 0, "No lookup during measurement");
  h.api.complete();
  assert.equal(h.requests.length, 1, "Late grant accepted");
  h.requests[0].resolve({ ok: true, json: async () => place });
  await flush();
  assert.equal(h.button.hidden, false);
  h.api.cancel();
  assert.equal(h.button.hidden, true);
  assert.match(
    h.status.textContent,
    /Đã dừng/,
    "Cancel must replace confirmation text",
  );
});
test("Cancel and restart fence delayed positions and reverse responses", async () => {
  const h = harness();
  h.api.begin();
  h.api.cancel();
  h.callbacks[0].ok(position(10));
  h.api.complete();
  assert.equal(h.requests.length, 0);
  h.api.begin();
  h.callbacks[1].ok(position(10.35));
  h.api.complete();
  assert.equal(h.requests.length, 1);
  h.api.begin();
  h.requests[0].resolve({ ok: true, json: async () => place });
  await flush();
  assert.equal(h.button.hidden, true);
  h.callbacks[1].ok(position(11));
  assert.equal(h.requests.length, 1, "Old permission callback discarded");
  h.callbacks[2].ok(position(12));
  h.api.complete();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].url.searchParams.get("latitude"), "12");
  h.requests[1].resolve({ ok: true, json: async () => place });
  await flush();
  assert.equal(h.button.hidden, false);
});
test("Malformed provider response keeps manual fallback without showing a false suggestion", async () => {
  const h = harness();
  h.api.begin();
  h.callbacks[0].ok(position(10.35));
  h.api.complete();
  h.requests[0].resolve({ ok: true, json: async () => null });
  await flush();
  assert.equal(h.button.hidden, true);
  assert.match(h.status.textContent, /chọn địa bàn|thủ công/i);
});
