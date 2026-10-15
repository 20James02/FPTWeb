import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const classes = () => ({ add() {}, remove() {} });
const cards = Array.from({ length: 3 }, () => ({
  dataset: {},
  style: {},
  classList: classes(),
  setAttribute() {},
  removeAttribute() {},
  querySelector() {
    return null;
  },
}));
const dots = {
  innerHTML: "",
  children: [],
  appendChild(dot) {
    this.children.push(dot);
  },
};
const nodes = {
  "plans-slider-track": { querySelectorAll: () => cards },
  "plans-3d-stage": { classList: classes() },
  "plans-slider-controls": { style: {} },
  "plans-slider-dots": dots,
};
const context = vm.createContext({
  window: { innerWidth: 390 },
  document: {
    getElementById: (id) => nodes[id],
    addEventListener() {},
    createElement: () => ({ setAttribute() {} }),
  },
  setTimeout(fn) {
    fn();
  },
});
vm.runInContext(
  fs.readFileSync("src/pagefpt/static/js/client/plans_3d.js", "utf8"),
  context,
);
context.renderMultitaskState(false);
const before = vm.runInContext("currentMultitaskIndex", context);
context.slidePlansNext();
assert.equal(
  vm.runInContext("currentMultitaskIndex", context),
  (before + 1) % 3,
  "Next must navigate cards hidden by the mobile carousel",
);
assert.equal(
  cards.filter((card) => card.style.display !== "none").length,
  3,
  "Mobile carousel displays center card with peeking adjacent cards",
);
cards[1].dataset.categoryHidden = "true";
cards[1].style.display = "none";
context.goToPlanSlide(0);
context.slidePlansNext();
assert.equal(vm.runInContext("currentMultitaskIndex", context), 1);
assert.equal(
  cards[1].style.display,
  "none",
  "Category-hidden card must remain excluded",
);
context.window.innerWidth = 960;
context.renderMultitaskState(false);
assert.equal(
  cards.filter((card) => card.style.display !== "none").length,
  2,
  "Tablet displays eligible cards with peek",
);
context.window.innerWidth = 1440;
context.renderMultitaskState(false);
assert.equal(
  cards.filter((card) => card.style.display !== "none").length,
  2,
  "Resize must restore eligible cards",
);
console.log(
  "Mobile catalog: navigation, category exclusion and desktop resize passed.",
);
