import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={Intl,Date,window:{},document:{addEventListener(){}},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/common.js','utf8'),context);
const statuses=['new','assigned','contacting','contacted','qualified','survey','quoted','closed','installed','unreachable','no_infrastructure','invalid','duplicate','rejected'];
for(const status of statuses){
 assert.ok(context.adminStatusLabel(status));
 assert.ok(['new','contacting','qualified','survey','installed','rejected'].includes(context.adminKanbanGroup(status)),status);
}
assert.equal(context.adminVietnamDay(new Date('2026-10-01T18:01:00Z')),'2026-10-02');
assert.equal(context.adminVietnamDay(new Date('2026-10-01T16:59:00Z')),'2026-10-01');
assert.ok(context.adminScoreReason({signal:'otp',kind:'confidence',weight:30}).includes('30'));
assert.ok(!context.adminScoreReason({signal:'otp',kind:'confidence',weight:30}).includes('[object Object]'));
assert.ok(context.adminScoreReason({signal:'return_visit',kind:'intent',age_days:2}).includes('2'));
assert.equal(context.adminScoreReason('<img src=x>'),'<img src=x>'); // rendered through textContent
console.log('Admin status coverage, score provenance and Vietnam calendar PASS');
assert.equal(context.adminDraftCost({monthly_vnd:200000,billing_months:6,setup_vnd:100000,equipment_vnd:50000,vat_included:false,vat_bps:1000}),1485000);
assert.equal(context.adminDraftCost({monthly_vnd:200000,billing_months:6,setup_vnd:100000,equipment_vnd:50000,vat_included:true,vat_bps:1000}),1350000);
console.log('Draft cost reconciles billing/fees/VAT without counting gift months PASS');
