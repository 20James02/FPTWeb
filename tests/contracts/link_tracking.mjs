import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const calls=[], callbacks={}, listeners={}, storage=new Map();
let consent=false, now=0, id=0;
const document={visibilityState:'visible',hasFocus:()=>true,getElementById:()=>null,
 addEventListener:(name,fn)=>(listeners[name] ||= []).push(fn)};
const window={location:{href:'https://example.test/?pf_link_source=source-proof'},history:{replaceState:()=>{}},
 crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++id).padStart(12,'0')}`},
 addEventListener:(name,fn)=>(listeners[name] ||= []).push(fn)};
const ctx=vm.createContext({window,document,URL,URLSearchParams,AbortSignal,JSON,Math,Promise,
 performance:{now:()=>now},Date:{now:()=>now},
 sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
 getAnalyticsContext:()=>({analytics_opt_in:consent,session_token:'session-proof'}),
 setInterval:(fn,ms)=>{callbacks[ms]=fn;return ms;},clearInterval:ms=>delete callbacks[ms],
 fetch:async(path,options={})=>{calls.push({path,body:options.body?JSON.parse(options.body):null});return {ok:true,status:200,json:async()=>path.endsWith('/visit')?{id:'visit-1',visit_token:'visit-proof'}:{accepted_ms:1000}};}});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/link_tracking.js','utf8'),ctx);
const settle=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
await settle();
assert.equal(calls.filter(x=>x.path.endsWith('/visit')).length,0);
assert.deepEqual(JSON.parse(JSON.stringify(window.PageFPTLinkTracking.leadContext())),{link_source_token:'source-proof'});
consent=true;
for(const fn of listeners['pagefpt-consent-change']||[])fn();
await settle();
assert.equal(calls.filter(x=>x.path.endsWith('/visit')).length,1);
for(let i=0;i<5;i++){now+=1000;callbacks[1000]();}
await window.PageFPTLinkTracking.flush();
assert.equal(calls.filter(x=>x.path.endsWith('/engagement')).at(-1).body.total_ms,5000);
document.visibilityState='hidden';
for(let i=0;i<10;i++){now+=1000;callbacks[1000]();}
await window.PageFPTLinkTracking.flush();
assert.equal(calls.filter(x=>x.path.endsWith('/engagement')).at(-1).body.total_ms,5000);
assert.equal(calls.filter(x=>x.path.endsWith('/engagement')).length,1,'Hidden pages must not send unchanged checkpoints');
document.visibilityState='visible';now+=61000;callbacks[1000]();
await window.PageFPTLinkTracking.flush();
assert.equal(calls.filter(x=>x.path.endsWith('/engagement')).at(-1).body.total_ms,5000);
consent=false;
for(const fn of listeners['pagefpt-consent-change']||[])fn();
await settle();
assert.equal(storage.size,0);
assert.equal(window.PageFPTLinkTracking.leadContext().link_visit_token,undefined);
assert.equal(calls.filter(x=>x.path.endsWith('/revoke')).length,1);
const previous=calls.filter(x=>x.path.endsWith('/engagement')).length;
await window.PageFPTLinkTracking.flush();
assert.equal(calls.filter(x=>x.path.endsWith('/engagement')).length,previous);
console.log('Link tracking: consent, hidden/idle timing, source-only form context and revocation passed');
// Saved consent may be awaiting server acknowledgement on the next document.
const nextCalls=[], nextEvents={}, saved=new Map([['pagefpt_link_journey_v1',JSON.stringify({source:'source-proof',visit:'visit-proof'})]]);
let nextConsent=false, nextSession=null;
const nextWindow={...window,location:{href:'https://example.test/packages'},
 addEventListener:(n,f)=>(nextEvents[n] ||= []).push(f)};
const nextContext=vm.createContext({window:nextWindow,document,URL,URLSearchParams,AbortSignal,JSON,Math,Promise,performance:{now:()=>0},Date:{now:()=>0},
 sessionStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},
 getAnalyticsContext:()=>({analytics_opt_in:nextConsent,session_token:nextSession}),setInterval:()=>1,clearInterval:()=>{},
 fetch:async(path,opts={})=>{nextCalls.push({path,body:opts.body?JSON.parse(opts.body):null});return {ok:true,status:200,json:async()=>path.endsWith('/context')?{source_token:null}:{id:'visit-1',visit_token:'visit-proof'}};}});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/link_tracking.js','utf8'),nextContext);
await settle();nextConsent=true;nextSession='next-session';
for(const fn of nextEvents['pagefpt-consent-change']||[])fn();
await settle();
assert.equal(nextCalls.filter(x=>x.path.endsWith('/visit')).length,1,'Resume after saved consent is acknowledged');
assert.equal(nextCalls.find(x=>x.path.endsWith('/visit')).body.visit_token,'visit-proof','Navigation must retain the existing measured journey');
console.log('Link tracking: navigation resumes only after consent acknowledgement without losing journey');
// An old voucher cookie must not replace the later consented content-link source.
async function sourcePrecedence(cookieAt){
 const seen=[],events={},memory=new Map([['pagefpt_link_journey_v1',JSON.stringify({source:'content-proof',visit:'content-visit',sourceAt:'2026-10-14T10:00:00Z'})]]);
 const w={...window,location:{href:'https://example.test/another-page'},addEventListener:(n,f)=>(events[n] ||= []).push(f)};
 const c=vm.createContext({window:w,document,URL,URLSearchParams,AbortSignal,JSON,Math,Promise,performance:{now:()=>0},Date:{now:()=>0,parse:Date.parse},
  sessionStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},
  getAnalyticsContext:()=>({analytics_opt_in:true,session_token:'active-session'}),setInterval:()=>1,clearInterval:()=>{},
  fetch:async(path,opts={})=>{seen.push({path,body:opts.body?JSON.parse(opts.body):null});return {ok:true,status:200,json:async()=>path.endsWith('/context')?{source_token:'voucher-proof',source_at:cookieAt}:{id:'journey',visit_token:'new-visit',source_at:cookieAt}};}});
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/link_tracking.js','utf8'),c);await settle();return seen.find(x=>x.path.endsWith('/visit')).body;
}
const olderCookie=await sourcePrecedence('2026-10-14T09:00:00Z');
assert.equal(olderCookie.source_token,'content-proof');assert.equal(olderCookie.visit_token,'content-visit');
const newerCookie=await sourcePrecedence('2026-10-14T11:00:00Z');
assert.equal(newerCookie.source_token,'voucher-proof');assert.equal(newerCookie.visit_token,undefined);
console.log('Link tracking: newer source wins; old voucher cookies never overwrite later content attribution');

const previewCalls=[],pw={...window};
const pc=vm.createContext({window:pw,document,URL,AbortSignal,JSON,Math,Promise,performance:{now:()=>0},Date:{now:()=>0},
 analyticsPreview:()=>true,getAnalyticsContext:()=>({analytics_opt_in:true,session_token:'session-proof'}),
 sessionStorage:{getItem:()=>null,removeItem:()=>{},setItem:()=>{}},setInterval:()=>1,clearInterval:()=>{},
 fetch:async(...args)=>{previewCalls.push(args);return {ok:true,status:200,json:async()=>({visit_token:'preview'})};}});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/link_tracking.js','utf8'),pc);await settle();
assert.equal(previewCalls.length,0,'Configured landing previews must never produce analytics or form attribution');
assert.deepEqual(JSON.parse(JSON.stringify(pw.PageFPTLinkTracking.leadContext())),{});

const navigationEvents={},anchor={value:'/san-pham/internet-gia-dinh?view=compact#plans',getAttribute:()=>anchor.value,setAttribute:(_n,v)=>anchor.value=v,hasAttribute:()=>false};
const nd={...document,addEventListener:(n,f)=>(navigationEvents[n] ||= []).push(f)};
const nw={...window,location:{href:'https://example.test/?pf_link_source=content-source'}};
const nc=vm.createContext({window:nw,document:nd,URL,AbortSignal,JSON,Math,Promise,performance:{now:()=>0},Date:{now:()=>0},
 getAnalyticsContext:()=>({analytics_opt_in:false,session_token:'session'}),sessionStorage:{getItem:()=>null,removeItem:()=>{},setItem:()=>{throw Error('No storage before consent');}},setInterval:()=>1,clearInterval:()=>{},fetch:()=>{throw Error('No tracking before consent');}});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/link_tracking.js','utf8'),nc);await settle();
for(const fn of navigationEvents.click||[])fn({target:{closest:()=>anchor}});
const navUrl=new URL(anchor.value,nw.location.href);
assert.equal(navUrl.searchParams.get('pf_link_source'),'content-source','Anonymous source must survive same-origin service navigation');
assert.equal(navUrl.searchParams.get('view'),'compact');assert.equal(navUrl.hash,'#plans');
for(const href of ['https://zalo.me/123','/admin/login','/r/new-source','/s/voucher','#local','/static/image.png']){
 anchor.value=href;for(const fn of navigationEvents.click||[])fn({target:{closest:()=>anchor}});assert.equal(anchor.value,href,'No source leak/override: '+href);
}
