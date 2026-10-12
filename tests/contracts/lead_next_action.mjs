import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx = vm.createContext({});
const file = "src/pagefpt/static/js/admin/lead_next_action.js";
assert.ok(fs.existsSync(file), "Guided next action is required");
vm.runInContext(fs.readFileSync(file, "utf8"), ctx);
const lead = { status: "new", payload: {} };
assert.equal(
  ctx.leadNextAction(lead, { assign: true }).target,
  "btn-manual-assign",
);
assert.equal(
  ctx.leadNextAction({ ...lead, status: "assigned" }, { profile: true }).target,
  "btn-edit-profile",
);
assert.equal(
  ctx.leadNextAction(
    {
      ...lead,
      status: "assigned",
      payload: {
        address_confirmation: { confirmed_at: "2026-10-10T00:00:00Z" },
      },
    },
    { pii: true },
  ).target,
  "btn-reveal-pii",
);
assert.equal(
  ctx.leadNextAction({ ...lead, status: "installed" }, { write: true }).target,
  "billing-heading",
);
assert.equal(
  ctx.leadNextAction(
    { ...lead, status: "rejected" },
    { assign: true, write: true },
  ).target,
  null,
);
assert.equal(
  ctx.leadNextAction(lead, {}).target,
  null,
  "Read-only users cannot get mutation actions",
);
console.log(
  "Next action: assignment, address, contact, billing, terminal and read-only roles passed.",
);
