import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const listeners = {},
  button = { disabled: false, addEventListener() {} },
  root = { setAttribute() {}, removeAttribute() {}, replaceChildren() {} },
  state = {};
let calls = 0,
  ok = true;
const document = {
  getElementById: (id) =>
    id === "workbench-groups"
      ? root
      : id === "workbench-state"
        ? state
        : button,
  addEventListener: (event, fn) => (listeners[event] = fn),
};
const ctx = vm.createContext({
  document,
  window: {},
  PageFPTDates: { format: (x) => x },
  adminFetch: async () => {
    calls++;
    return { ok, json: async () => ({ groups: [], checked_at: "now" }) };
  },
});
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/admin/workbench.js", "utf8"),
  ctx,
);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls, 1);
assert.equal(
  typeof ctx.window.loadWorkbench,
  "function",
  "Polling needs an awaited refresh hook",
);
listeners["admin:data-changed"]({ detail: {} });
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls, 2, "Change notification reloads queues");
assert.equal(await ctx.window.loadWorkbench(), true);
ok = false;
assert.equal(
  await ctx.window.loadWorkbench(),
  false,
  "Refresh failure keeps polling cursor retryable",
);
console.log(
  "Workbench refresh: initial, changes, awaited success and retryable failures passed",
);
