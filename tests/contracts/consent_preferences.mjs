import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function harness(saved = null, unavailable = false) {
  let data = saved;
  const localStorage = {
    getItem: () => {
      if (unavailable) throw Error("blocked");
      return data;
    },
    setItem: (_, value) => {
      if (unavailable) throw Error("blocked");
      data = value;
    },
  };
  const ctx = vm.createContext({ window: { localStorage }, Date, JSON });
  vm.runInContext(
    fs.readFileSync(
      "src/pagefpt/static/js/client/consent_preferences.js",
      "utf8",
    ),
    ctx,
  );
  return {
    prefs: ctx.window.PageFPTConsentPreferences,
    saved: () => JSON.parse(data),
  };
}
test("consent records only explicit booleans, expires and handles blocked storage", () => {
  const h = harness();
  assert.equal(h.prefs.read(), null);
  h.prefs.write(true, false);
  assert.equal(
    h.saved().version,
    "2026-10-v2",
    "Changed measurement notice requires a fresh choice",
  );
  assert.equal(h.prefs.read().analytics, true);
  assert.equal(h.prefs.read().marketing, false);
  assert.deepEqual(Object.keys(h.saved()).sort(), [
    "advertising",
    "analytics",
    "expires",
    "marketing",
    "personalization",
    "version",
  ]);
  assert.equal(h.prefs.read().advertising, false);
  h.prefs.write(true, true);
  assert.equal(h.prefs.read().advertising, false, "Legacy marketing does not grant advertising");
  h.prefs.write(true, true, true, false);
  assert.equal(h.prefs.read().advertising, true);
  assert.equal(h.prefs.read().personalization, false);
  h.prefs.write(false, true, true, true);
  assert.equal(h.prefs.read().advertising, false);
  assert.equal(h.prefs.read().personalization, false);
  h.prefs.write(true, false);
  const old = h.saved();
  old.expires = Date.now() - 1;
  assert.equal(harness(JSON.stringify(old)).prefs.read(), null);
  old.expires = Date.now() + 1000;
  old.analytics = "true";
  assert.equal(harness(JSON.stringify(old)).prefs.read(), null);
  assert.equal(harness("{broken").prefs.read(), null);
  const blocked = harness(null, true);
  assert.equal(blocked.prefs.read(), null);
  assert.doesNotThrow(() => blocked.prefs.write(true, false));
});
