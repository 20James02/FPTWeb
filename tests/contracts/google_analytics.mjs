import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(
  "src/pagefpt/static/js/client/google_analytics.js",
  "utf8",
);
const plan = "11111111-1111-4111-8111-111111111111";
function harness(preview = false, mode = "advanced") {
  let consent = { analytics_opt_in: false, marketing_opt_in: false };
  const listeners = {},
    nodes = [];
  const document = {
    title: "Internet FPT",
    referrer: "https://example.test/?email=private@example.test",
    getElementById(id) {
      return id === "pagefpt-google-config"
        ? {
            textContent: JSON.stringify({
              measurement_id: "G-D0J0XLJ891",
              consent_mode: mode,
              preview,
            }),
          }
        : null;
    },
    createElement() {
      return {};
    },
    head: {
      appendChild(node) {
        nodes.push(node);
      },
    },
    addEventListener(name, fn) {
      (listeners[name] ||= []).push(fn);
    },
  };
  const window = {
    location: {
      href: "https://fpt-vungtau.com/?phone=0981234567&email=private@example.test&utm_source=facebook&utm_medium=paid_social&utm_campaign=camera",
      pathname: "/",
    },
    addEventListener: document.addEventListener,
  };
  const ctx = vm.createContext({
    window,
    document,
    URL,
    URLSearchParams,
    getAnalyticsContext: () => consent,
    IntersectionObserver: undefined,
  });
  vm.runInContext(source, ctx);
  const fire = (name, detail) => {
    for (const fn of listeners[name] || []) fn({ detail });
  };
  return {
    window,
    nodes,
    ctx,
    fire,
    grant(marketing = false) {
      consent = { analytics_opt_in: true, marketing_opt_in: marketing };
      fire("pagefpt-consent-change");
    },
    deny() {
      consent = { analytics_opt_in: false, marketing_opt_in: false };
      fire("pagefpt-consent-change");
    },
    marketingOnly() {
      consent = { analytics_opt_in: false, marketing_opt_in: true };
      fire("pagefpt-consent-change");
    },
    commands: () => Array.from(window.dataLayer || [], (x) => Array.from(x)),
    events: () =>
      Array.from(window.dataLayer || [], (x) => Array.from(x)).filter(
        (x) => x[0] === "event",
      ),
  };
}
const h = harness();
assert.equal(h.nodes.length, 1, "Advanced tag loads before a choice");
assert.equal(h.commands()[0][0], "consent");
assert.equal(h.commands()[0][1], "default");
assert.equal(h.commands()[0][2].analytics_storage, "denied");
assert.equal(h.commands()[0][2].ad_user_data, "denied");
assert.ok(
  h
    .commands()
    .some(
      (x) =>
        x[0] === "set" && x[1]?.page_location === "https://fpt-vungtau.com/",
    ),
  "Global page fields protect consent-generated hits too",
);
assert.equal(h.events().filter((x) => x[1] === "page_view").length, 1);
h.window.PageFPTGoogle.track("select_plan", { plan_id: plan });
assert.equal(h.events().at(-1)[1], "select_plan");
assert.equal(
  h.events().at(-1)[2].plan_id,
  undefined,
  "Denied omits catalog/context IDs",
);
h.grant();
assert.equal(h.nodes.length, 1);
assert.equal(
  h.nodes[0].src,
  "https://www.googletagmanager.com/gtag/js?id=G-D0J0XLJ891",
);
assert.equal(h.nodes[0].async, true);
assert.equal(h.events().filter((x) => x[1] === "page_view").length, 1);
h.grant();
vm.runInContext(source, h.ctx);
assert.equal(
  h.nodes.length,
  1,
  "Repeated initialization cannot duplicate the tag",
);
assert.equal(h.events().filter((x) => x[1] === "page_view").length, 1);
h.window.PageFPTGoogle.track("select_plan", {
  plan_id: plan,
  phone: "0981234567",
  email: "private@example.test",
  address: "Private address",
});
h.window.PageFPTGoogle.track("select_billing_period", {
  plan_id: plan,
  billing_months: 12,
});
h.window.PageFPTGoogle.track("arbitrary", { phone: "0981234567" });
const serialized = JSON.stringify(h.commands());
for (const pii of ["0981234567", "private@example.test", "Private address"])
  assert.equal(
    serialized.includes(pii),
    false,
    "PII must never reach dataLayer",
  );
assert.equal(
  serialized.includes("utm_source"),
  false,
  "Marketing attribution disabled without its choice",
);
assert.equal(
  h.events().filter((x) => x[1] === "select_billing_period").length,
  1,
);
const receipt = "22222222-2222-4222-8222-222222222222";
h.fire("pagefpt:lead-accepted", {
  event_id: receipt,
  plan_id: plan,
  billing_months: 12,
  accessory_count: 2,
  phone: "0981234567",
});
h.fire("pagefpt:lead-accepted", { event_id: receipt, plan_id: plan });
assert.equal(
  h.events().filter((x) => x[1] === "generate_lead").length,
  1,
  "A retried committed receipt counts once",
);
assert.equal(
  JSON.stringify(h.events()).includes(receipt),
  false,
  "Internal receipt IDs stay internal",
);
h.deny();
const count = h.events().length;
h.window.PageFPTGoogle.track("select_plan", { plan_id: plan });
h.fire("pagefpt:lead-accepted", {
  event_id: "33333333-3333-4333-8333-333333333333",
});
assert.equal(
  h.events().length,
  count + 2,
  "Revocation retains limited cookieless events",
);
assert.equal(h.events().at(-2)[2].plan_id, undefined);
assert.equal(h.window["ga-disable-G-D0J0XLJ891"], false);
assert.equal(
  h
    .commands()
    .filter((x) => x[0] === "consent" && x[1] === "update")
    .at(-1)[2].analytics_storage,
  "denied",
);
const preview = harness(true);
preview.grant();
assert.equal(preview.nodes.length, 0, "Admin preview never tracks");
const m = harness();
m.grant(true);
assert.match(JSON.stringify(m.commands()), /facebook/);
assert.equal(
  m.commands().find((x) => x[0] === "consent" && x[1] === "update")[2]
    .ad_user_data,
  "denied",
  "Source attribution is not advertising personalization consent",
);
m.deny();
m.grant(false);
assert.equal(
  m
    .commands()
    .filter((x) => x[0] === "config")
    .at(-1)[2].campaign_source,
  "",
  "Revoking marketing clears earlier campaign overrides",
);
assert.equal(
  m.events().filter((x) => x[1] === "page_view").length,
  1,
  "Consent updates never generate another pageview",
);
const deniedLead = harness();
deniedLead.marketingOnly();
assert.equal(
  JSON.stringify(deniedLead.commands()).includes("facebook"),
  false,
  "No campaigns without analytics storage consent",
);
deniedLead.fire("pagefpt:lead-accepted", {
  event_id: receipt,
  plan_id: plan,
  phone: "0981234567",
});
deniedLead.fire("pagefpt:lead-accepted", { event_id: receipt, plan_id: plan });
assert.equal(
  deniedLead.events().filter((x) => x[1] === "generate_lead").length,
  1,
);
assert.equal(deniedLead.events().at(-1)[2].plan_id, undefined);
assert.equal(JSON.stringify(deniedLead.commands()).includes(receipt), false);
const basic = harness(false, "basic");
assert.equal(basic.nodes.length, 0, "Basic fallback blocks before consent");
basic.grant();
assert.equal(basic.nodes.length, 1);
basic.deny();
const basicCount = basic.events().length;
assert.equal(
  basic.window.PageFPTGoogle.track("select_plan", { plan_id: plan }),
  false,
);
assert.equal(basic.events().length, basicCount);
console.log(
  "GA4: advanced denied/granted/withdrawn, basic fallback, preview, single initialization, URL/PII filtering, attribution, lead deduplication passed.",
);
const committed=harness(false,'basic');committed.grant();committed.window.PageFPTGoogle.acceptReceipt({event_id:receipt,plan_id:plan});committed.fire('pagefpt:lead-accepted',{event_id:receipt,plan_id:plan});assert.equal(committed.events().filter(x=>x[1]==='generate_lead').length,1,'Receipt bootstrap and normal DOM listener share one deduplication path');
const renamed=harness(false,'basic');renamed.grant();
const bridged=[];renamed.window.PageFPTMeasurement={behavior:(...args)=>{bridged.push(args);return false;}};
renamed.window.PageFPTGoogle.apply({measurement_id:'G-D0J0XLJ891',consent_mode:'basic',event_enabled:['click_zalo'],targets:[{provider:'ga4',event:'click_zalo',provider_event:'zalo_contact',route:'browser',settings:{measurement_id:'G-D0J0XLJ891',browser_enabled:true}}]});
renamed.window.PageFPTGoogle.track('click_zalo',{});
assert.equal(renamed.events().at(-1)[1],'zalo_contact');
assert.equal(bridged.at(-1)[0],'click_zalo');
assert.equal(renamed.events().filter(e=>e[1]==='click_zalo').length,0,'Renaming must not emit the original plus an alias');
console.log('GA4 native behavior mapping: alias replaces the source event and bridges other providers once');
