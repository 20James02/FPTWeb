import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
function harness(choice = null, fail = false, preview = false) {
  const calls = [],
    stored = [],
    events = [];
  const handlers={};
  const window = {
    PageFPTConsentPreferences: {
      read: () => choice,
      write: (...values) => stored.push(values),
    },
    location: { search: "", pathname: "/" },
    addEventListener(name,handler) {handlers[name]=handler;},
    dispatchEvent: (e) => {events.push(e.type);handlers[e.type]?.(e);},
  };
  const ctx = vm.createContext({
    window,
    document: {
      body: { dataset: {} },
      getElementById: () => ({ textContent: JSON.stringify({ preview }) }),
      addEventListener() {},
    },
    fetch: async (path, options) => {
      calls.push({ path, body: JSON.parse(options.body) });
      return { ok: !fail, json: async () => ({ session_token: "qa-session" }) };
    },
    AbortSignal,
    URLSearchParams,
    CustomEvent: class {
      constructor(type) {
        this.type = type;
      }
    },
    setTimeout,
    clearTimeout,
    navigator: {},
  });
  vm.runInContext(
    fs.readFileSync("src/pagefpt/static/js/client/analytics.js", "utf8"),
    ctx,
  );
  return { ctx, calls, stored, events };
}
test("one session creation restores saved consent only after server acknowledgement", async () => {
  const h = harness({ analytics: true, marketing: false });
  await Promise.all([
    vm.runInContext("initClientSession()", h.ctx),
    vm.runInContext("initClientSession()", h.ctx),
  ]);
  assert.equal(h.calls.filter((x) => x.path === "/api/v1/sessions").length, 1);
  assert.equal(h.calls[0].body.analytics, true);
  assert.equal(
    vm.runInContext("getAnalyticsContext().analytics_opt_in", h.ctx),
    true,
  );
  assert.ok(h.events.includes("pagefpt-consent-change"));
  const failed = harness({ analytics: true, marketing: false }, true);
  await vm.runInContext("initClientSession()", failed.ctx);
  assert.equal(
    vm.runInContext("getAnalyticsContext().analytics_opt_in", failed.ctx),
    false,
  );
});
test("failed choice is not persisted and preview cannot restore analytics", async () => {
  const h = harness(null, true);
  await assert.rejects(
    vm.runInContext("setAnalyticsConsent(true,false)", h.ctx),
  );
  assert.equal(h.stored.length, 0);
  const p = harness({ analytics: true, marketing: true }, false, true);
  await vm.runInContext("initClientSession()", p.ctx);
  assert.equal(p.calls.length, 0);
});
test("withdrawal restricts locally even when the consent API fails", async () => {
  const h = harness({ analytics: true, marketing: true });
  await vm.runInContext("initClientSession()", h.ctx);
  vm.runInContext("fetch = async () => ({ok:false})", h.ctx);
  await assert.rejects(
    vm.runInContext("setAnalyticsConsent(false,false)", h.ctx),
  );
  assert.equal(
    vm.runInContext("getAnalyticsContext().analytics_opt_in", h.ctx),
    false,
  );
  assert.equal(
    vm.runInContext("getAnalyticsContext().marketing_opt_in", h.ctx),
    false,
  );
  assert.deepEqual(h.stored.at(-1), [false, false]);
});
test("a late session acknowledgement cannot restore consent after withdrawal", async () => {
  const h = harness({ analytics: true, marketing: true });
  vm.runInContext(
    "var reply; fetch = async path => path === '/api/v1/sessions' ? new Promise(resolve => reply=resolve) : ({ok:false})",
    h.ctx,
  );
  const initializing = vm.runInContext("initClientSession()", h.ctx);
  const withdrawing = vm.runInContext(
    "setAnalyticsConsent(false,false)",
    h.ctx,
  );
  vm.runInContext(
    "reply({ok:true,json:async()=>({session_token:'late-session'})})",
    h.ctx,
  );
  await initializing;
  await assert.rejects(withdrawing);
  assert.equal(
    vm.runInContext("getAnalyticsContext().analytics_opt_in", h.ctx),
    false,
  );
  assert.equal(
    vm.runInContext("getAnalyticsContext().marketing_opt_in", h.ctx),
    false,
  );
});
test('consented sessions survive a page navigation; denied sessions are never persisted', async()=>{
 const storage=new Map();const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 const first=harness({analytics:true,marketing:true,advertising:true});first.ctx.window.localStorage=localStorage;
 await vm.runInContext('initClientSession()',first.ctx);assert.equal(storage.size,1);
 const second=harness({analytics:true,marketing:true,advertising:true});second.ctx.window.localStorage=localStorage;
 const fallback=second.ctx.fetch;second.ctx.fetch=async(path,options)=>path==='/api/v1/sessions/resume'?{ok:true,json:async()=>({analytics:true,marketing:true,advertising:true,personalization:false})}:fallback(path,options);
 await vm.runInContext('initClientSession()',second.ctx);assert.equal(second.calls.filter(x=>x.path==='/api/v1/sessions').length,0);
 assert.equal(vm.runInContext('getAnalyticsContext().session_token',second.ctx),'qa-session');
 await vm.runInContext('setAnalyticsConsent(false,false)',second.ctx);assert.equal(storage.size,0);
});

test('another tab withdrawal immediately restricts tracking without granting new purposes',async()=>{const h=harness({analytics:true,marketing:true,advertising:true});await vm.runInContext('initClientSession()',h.ctx);h.ctx.window.PageFPTConsentPreferences.read=()=>({analytics:false,marketing:false,advertising:false,personalization:false});h.ctx.window.dispatchEvent({type:'storage',key:'pagefpt-data-choice'});assert.equal(vm.runInContext('getAnalyticsContext().analytics_opt_in',h.ctx),false);assert.equal(vm.runInContext('getAnalyticsContext().advertising_opt_in',h.ctx),false);});
test('offline withdrawal retains essential retry proof and flushes it before the next page session',async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const h=harness({analytics:true,marketing:true,advertising:true});h.ctx.window.localStorage=storage;await vm.runInContext('initClientSession()',h.ctx);
 h.ctx.fetch=async()=>{throw Error('offline');};await assert.rejects(vm.runInContext('setAnalyticsConsent(false,false)',h.ctx));
 assert.ok(values.has('pagefpt_pending_revocations_v1'));
 const next=harness({analytics:false,marketing:false,advertising:false});next.ctx.window.localStorage=storage;await vm.runInContext('initClientSession()',next.ctx);
 assert.equal(next.calls[0].path,'/api/v1/consent/revoke');assert.equal(next.calls[0].body.session_token,'qa-session');assert.equal(values.has('pagefpt_pending_revocations_v1'),false);
});
