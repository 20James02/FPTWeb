import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const planA='11111111-1111-4111-8111-111111111111', planB='22222222-2222-4222-8222-222222222222';
const nodes={
 'form-plan-name':{textContent:''},'form-plan-fee':{textContent:''},
 'bottom-sheet-backdrop':{classList:{add(){}}}
};
let selectedRegion='33333333-3333-4333-8333-333333333333';
const pending=[];
const context=vm.createContext({getSelectedRegionId:()=>selectedRegion,window:{innerWidth:390},document:{querySelector:()=>null,getElementById:id=>nodes[id],body:{style:{}},addEventListener(){}},Intl,AbortController,AbortSignal,setTimeout(){},fetch:(path,options)=>new Promise(resolve=>pending.push({path,options,resolve}))});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/bottom_sheet.js','utf8'),context);
const read=name=>vm.runInContext(name,context);
context.openBottomSheet('Plan A','',planA);
const first=pending[0];
context.openBottomSheet('Plan B','',planB);
const second=pending[1];
second.resolve({ok:true,json:async()=>({status:'confirmed',quote_token:'token-B',initial_total_vnd:600,billing_months:6,service_months:6})});
await new Promise(resolve=>setImmediate(resolve));
first.resolve({ok:true,json:async()=>({status:'confirmed',quote_token:'token-A',initial_total_vnd:999,billing_months:6,service_months:6})});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(read('activeQuoteToken'),'token-B','Late response must not replace the current quote');
context.openBottomSheet();
assert.equal(read('selectedPlanId'),null,'Generic consultation must not retain a previous package');
assert.equal(read('activeQuoteToken'),null,'A stale quote must be cleared immediately');
console.log('Quote selection: stale responses fenced; generic CTA clears package and quote.');
// A quote response for a previous region must never attach to the new region.
context.openBottomSheet('Plan A','',planA);
const oldRegion=pending.at(-1);
selectedRegion='44444444-4444-4444-8444-444444444444';
context.refreshActiveQuote();
const newRegion=pending.at(-1);
assert.notEqual(JSON.parse(oldRegion.options.body).region_id,JSON.parse(newRegion.options.body).region_id);
newRegion.resolve({ok:true,json:async()=>({status:'confirmed',quote_token:'new-region',expires_at:'2099-01-01T00:00:00Z',initial_total_vnd:200})});
await new Promise(resolve=>setImmediate(resolve));
oldRegion.resolve({ok:true,json:async()=>({status:'confirmed',quote_token:'old-region',initial_total_vnd:100})});
await new Promise(resolve=>setImmediate(resolve));
assert.equal(read('activeQuoteToken'),'new-region');
// Simulate the deadline expiring: the form remains usable for consultation.
let deadline;
context.AbortSignal={timeout:ms=>{deadline=ms;return AbortSignal.abort();}};
context.fetch=async(path,options)=>{assert.equal(options.signal.aborted,true);throw new Error('Deadline');};
context.refreshActiveQuote();await read('quoteRequest');
assert.equal(deadline,3000);assert.equal(read('activeQuoteToken'),null);
assert.match(nodes['form-plan-fee'].textContent,/Chưa xác nhận giá/);
console.log('Quote selection: region changes fenced; timeout falls back to consultation.');
// When pricing is unavailable, consultation still retains the selected term.
nodes['lead-phone']={value:'0981234567',classList:{remove(){}},removeAttribute(){}};
nodes['lead-name']={value:'QA'};
nodes['lead-address']={value:'QA address'};
nodes['lead-consent']={checked:true};
nodes['bottom-sheet-backdrop'].classList.remove=()=>{};
context.window.PageFPTAccessories={term:()=>12,ids:()=>[]};
let submitted;
context.submitLeadToBackend=async payload=>{submitted=payload;return {receipt:'QA'};};
context.openConfirmationModal=()=>{};
await context.handleLeadSubmit({preventDefault(){}});
assert.equal(submitted.plan_id,planA);
assert.equal(submitted.quote_token,null);
assert.match(submitted.notes,/Kỳ thanh toán quan tâm: 12 tháng/);
context.window.PageFPTLanding={preview:true};
submitted=null;
await context.handleLeadSubmit({preventDefault(){}});
assert.equal(submitted,null,'Unsaved preview cannot submit a lead');
console.log('Consultation retains requested term without quote; preview cannot submit.');
