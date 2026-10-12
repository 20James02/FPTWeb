import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  "src/pagefpt/static/js/client/google_analytics.js",
  "utf8",
);
const id = "11111111-1111-4111-8111-111111111111";
const nodes = [],
  listeners = {},
  observers = [],
  mutations = [];
const card = {
  dataset: { analyticsPlanId: id, analyticsPlacement: "speedtest" },
};
const cards = [card];
const document = {
  referrer: "",
  documentElement: {},
  getElementById: () => ({
    textContent: JSON.stringify({
      measurement_id: "G-D0J0XLJ891",
      consent_mode: "advanced",
    }),
  }),
  createElement: () => ({}),
  head: { appendChild: (node) => nodes.push(node) },
  addEventListener: (event, fn) => {
    listeners[event] = fn;
  },
  querySelectorAll: (selector) =>
    selector.includes("analytics-plan-id") ? cards : [],
};
const window = {
  location: { href: "https://example.test/do-toc-do", pathname: "/do-toc-do" },
  addEventListener: document.addEventListener,
};
const ctx = vm.createContext({
  window,
  document,
  URL,
  URLSearchParams,
  getAnalyticsContext: () => ({ analytics_opt_in: true }),
  IntersectionObserver: class {
    constructor(fn) {
      this.fn = fn;
      this.cards = [];
      observers.push(this);
    }
    observe(card) {
      this.cards.push(card);
    }
  },
  MutationObserver: class {
    constructor(fn) {
      mutations.push(fn);
    }
    observe() {}
  },
});
vm.runInContext(source, ctx);
assert.ok(
  observers[0].cards.includes(card),
  "Speedtest cards must be observed",
);
const visible = (target) => ({
  target,
  isIntersecting: true,
  intersectionRatio: 0.75,
});
observers[0].fn([visible(card), visible(card)]);
let events = () =>
  window.dataLayer.map((x) => Array.from(x)).filter((x) => x[0] === "event");
assert.equal(events().filter((x) => x[1] === "view_plan").length, 1);
assert.equal(
  events().find((x) => x[1] === "view_plan")[2].placement,
  "speedtest",
);
const later = {
  dataset: {
    analyticsPlanId: "22222222-2222-4222-8222-222222222222",
    analyticsPlacement: "speedtest",
  },
};
cards.push(later);
assert.equal(mutations.length, 1);
mutations[0]([{ addedNodes: [later] }]);
assert.ok(observers[0].cards.includes(later), "New cards must be observed");
const button = {
  dataset: {
    analyticsPlanId: id,
    analyticsAction: "select_plan",
    analyticsPlacement: "speedtest",
  },
};
listeners.click({
  target: {
    closest: (selector) =>
      selector.includes("analytics-action") ? button : null,
  },
});
assert.equal(events().filter((x) => x[1] === "select_plan").length, 1);
assert.equal(events().at(-1)[2].placement, "speedtest");
console.log(
  "Plan measurement: speedtest visibility, dedupe, dynamic DOM and CTA passed.",
);

// A denied impression must not prevent the attributed impression after consent.
let allowed = false;
const deniedObservers = [], deniedListeners = {};
const deniedDocument = {...document, addEventListener: (event, fn) => {deniedListeners[event] = fn}};
const deniedWindow = {location: window.location, addEventListener: deniedDocument.addEventListener};
const deniedCtx = vm.createContext({window: deniedWindow, document: deniedDocument, URL, URLSearchParams,
  getAnalyticsContext: () => ({analytics_opt_in:allowed}),
  IntersectionObserver: class {constructor(fn) {this.fn=fn;deniedObservers.push(this)} observe() {} disconnect() {}},
});
vm.runInContext(source,deniedCtx);
deniedObservers[0].fn([visible(card)]);
const deniedEvents = () => deniedWindow.dataLayer.map(x=>Array.from(x)).filter(x=>x[0]==='event'&&x[1]==='view_plan');
assert.equal(deniedEvents()[0][2].plan_id, undefined);
allowed=true;
deniedListeners['pagefpt-consent-change']();
assert.equal(deniedObservers.length,2,'Consent must reobserve cards already visible');
deniedObservers[1].fn([visible(card),visible(card)]);
assert.equal(deniedEvents().length,2);
assert.equal(deniedEvents()[1][2].plan_id,id);
assert.equal(deniedEvents()[0][2].measurement_mode,'limited');
assert.equal(deniedEvents()[1][2].measurement_mode,'consented');
deniedListeners['pagefpt-consent-change']();
assert.equal(deniedObservers.length,2,'Repeated grant cannot reset impressions');
