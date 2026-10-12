import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const ctx = vm.createContext({ window: {}, Intl, Date });
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/client/speed_cards.js", "utf8"),
  ctx,
);
const model = ctx.window.PageFPTSpeedCards;
test("price separates monthly cost and prepaid total without inventing prices", () => {
  assert.equal(model.price(null), null);
  assert.equal(model.price({ status: "not_available" }), null);
  const q = {
    status: "confirmed",
    monthly_vnd: 220000,
    initial_total_vnd: 1320000,
    billing_months: 6,
    vat_included: true,
  };
  assert.equal(model.price(q).amount, "220.000đ");
  assert.equal(model.price(q).unit, "/tháng");
  assert.match(model.price(q).note, /6 tháng/);
  assert.match(model.price(q).note, /1.320.000đ/);
  assert.equal(model.price({ ...q, monthly_vnd: null }).amount, "1.320.000đ");
  assert.equal(
    model.price({ ...q, monthly_vnd: null }).caption,
    "Thanh toán ban đầu",
  );
  assert.equal(
    model.price({ ...q, monthly_vnd: 0, initial_total_vnd: 0 }).amount,
    "0đ",
  );
  for (const patch of [
    { monthly_vnd: "220000" },
    { monthly_vnd: -1 },
    { initial_total_vnd: -1 },
    { billing_months: 12 },
    { expires_at: "2020-01-01T00:00:00Z" },
  ])
    assert.equal(model.price({ ...q, ...patch }), null);
});
test("recommendation highlights only the first measured option and keeps claims tied to published speed", () => {
  const plan = { service: "internet", speed_mbps: 300 };
  assert.equal(model.fit(plan, null, 0).highlighted, false);
  assert.equal(model.fit(plan, 100, 0).highlighted, true);
  assert.equal(model.fit(plan, 100, 1).highlighted, false);
  assert.match(model.fit(plan, 100, 0).reason, /niêm yết/);
  assert.doesNotMatch(model.fit(plan, 400, 0).reason, /cao hơn/);
  assert.doesNotMatch(
    model.fit({ ...plan, speed_mbps: null }, 100, 0).reason,
    /cao hơn/,
  );
  for (const service of ["internet", "combo", "business"])
    assert.ok(model.fit({ service }, null, 0).hook.length > 0);
});
