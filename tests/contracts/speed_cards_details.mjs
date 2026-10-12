import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
test("prepaid-only package detail never presents an unknown monthly rate as zero", () => {
  const nodes = new Map();
  const node = () => ({
    children: [],
    append(...n) {
      this.children.push(...n);
    },
    replaceChildren(...n) {
      this.children = n;
    },
    removeAttribute() {},
    addEventListener() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  });
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id);
  };
  const quote = {
    monthly_vnd: null,
    initial_total_vnd: 1320000,
    billing_months: 6,
    service_months: 6,
  };
  const ctx = vm.createContext({
    window: {
      PageFPTAccessories: {
        current: () => quote,
        parts: () => ({ once: 0, monthly: 0 }),
        term: () => 6,
        total: () => 1320000,
      },
    },
    document: {
      getElementById: get,
      createElement: node,
      addEventListener() {},
    },
    getPublishedPlans: () => [
      { id: "plan", name: "Gói trả trước", equipment: [] },
    ],
    Intl,
    openBottomSheet() {},
    toggleCompare() {},
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/plan_details.js", "utf8"),
    ctx,
  );
  ctx.window.openPublishedPlanDetails({ dataset: { planDetail: "plan" } });
  const facts = get("plan-details-facts").children;
  const monthly = facts.findIndex((n) => n.textContent === "Cước mỗi tháng");
  assert.equal(facts[monthly + 1].textContent, "Cần tư vấn");
  const total = facts.findIndex(
    (n) => n.textContent === "Tổng thanh toán ban đầu",
  );
  assert.equal(facts[total + 1].textContent, "1.320.000đ");
});
