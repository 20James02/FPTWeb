import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let deadline;
let payload;
const nodes={
 'lead-phone':{value:'0916009998',classList:{remove(){}},removeAttribute(){}},
 'lead-consent':{checked:true},'btn-submit-lead':{disabled:false}
};
const context=vm.createContext({document:{addEventListener(){},getElementById:id=>nodes[id],body:{style:{}}},window:{addEventListener(){}},AbortSignal:{timeout(ms){deadline=ms;return AbortSignal.abort();}},fetch:async(path,options)=>{assert.equal(options.signal?.aborted,true,'Auxiliary session request must have a deadline');throw new Error('Session timeout');},submitLeadToBackend:async data=>{payload=data;return {receipt:'committed'};},setTimeout(){}});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/analytics.js','utf8'),context);
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/bottom_sheet.js','utf8'),context);
await context.handleLeadSubmit({preventDefault(){}});
assert.equal(deadline,3000);
assert.equal(payload.session_token,null);
assert.equal(nodes['btn-submit-lead'].disabled,false);
console.log('Session deadline: auxiliary timeout falls back to null token and lead submission succeeds.');
