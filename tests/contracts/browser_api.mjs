import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let counter = 0;
let responses = [];
const calls = [];
const context = vm.createContext({
  window:{addEventListener:()=>{},crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`},location:{pathname:'/admin/login',assign:()=>{}}},
  document:{addEventListener:()=>{},cookie:'pagefpt_csrf=csrf-test'},
  localStorage:{removeItem:()=>{},setItem:()=>{throw new Error('Credentials must not enter storage');}},
  Headers, AbortSignal,
  setTimeout:callback=>{callback();return 1;},
  fetch:async (path,options)=>{
    calls.push({path,...options});
    const value=responses.shift();
    if (value instanceof Error) throw value;
    return new Response(JSON.stringify(value.body),{status:value.status});
  }
});
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/api.js','utf8'),context);
const payload={phone:'0901234567',consent_version:'v1'};
responses=[new Error('response lost after commit'),{status:200,body:{receipt:'real-receipt',event_id:'stable-event'}}];
assert.equal((await context.submitLeadToBackend(payload)).receipt,'real-receipt');
assert.equal(calls[0].headers['Idempotency-Key'],calls[1].headers['Idempotency-Key']);
assert.equal(calls[0].body,calls[1].body);
responses=[{status:409,body:{code:'IDEMPOTENCY_CONFLICT'}}];
await assert.rejects(()=>context.submitLeadToBackend(payload));
responses=[{status:201,body:{}}];
await assert.rejects(()=>context.submitLeadToBackend(payload));
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/auth.js','utf8'),context);
responses=[{status:503,body:{code:'AUTH_UNAVAILABLE'}}];
assert.equal((await context.loginWithCredentials('admin@example.com','bad')).success,false);
responses=[{status:403,body:{code:'MFA_REQUIRED'}}];
assert.equal((await context.loginWithCredentials('admin@example.com','password')).requiresMFA,true);
responses=[{status:200,body:{signed_out:true}}];
await context.adminFetch('/api/v1/auth/session',{method:'DELETE'});
assert.equal(calls.at(-1).headers.get('X-CSRF-Token'),'csrf-test');
process.stdout.write('Browser API contracts: lost-response retry, conflict, malformed receipt, auth failure, MFA, CSRF passed.\n');
vm.runInContext(fs.readFileSync('src/pagefpt/static/js/client/analytics.js','utf8'),context);
const callCountBeforeConsent = calls.length;
context.trackEvent('start_form',{phone:'0901234567'});
await context.flushEvents();
assert.equal(calls.length,callCountBeforeConsent);
assert.equal(context.getAnalyticsContext().analytics_opt_in,false);
process.stdout.write('Analytics contract: no tracking or network requests before consent passed.\n');
let redirects=0;
context.window.location={pathname:'/admin/dashboard',assign:()=>redirects++};
responses=[{status:200,body:{signed_out:true}},{status:401,body:{code:'UNAUTHENTICATED'}}];
await Promise.all([context.logoutAdmin(),context.adminFetch('/api/v1/admin/me')]);
assert.equal(redirects,1,'Logout and an in-flight expired request must navigate only once');
console.log('Admin navigation: logout/401 race navigates once.');
const unresolved={phone:'0901234500',consent_version:'v1',plan_id:'published-plan',quote_token:'quote-before',session_token:null};
responses=[new Error('lost after commit'),new Error('lost after commit'),new Error('lost after commit')];
const firstAttempt=calls.length;
await assert.rejects(()=>context.submitLeadToBackend(unresolved));
responses=[{status:200,body:{receipt:'original-committed-receipt',event_id:'same-event'}}];
const retry=await context.submitLeadToBackend({...unresolved,quote_token:'quote-refreshed',session_token:'session-now-available'});
assert.equal(retry.receipt,'original-committed-receipt');
for(const call of calls.slice(firstAttempt)) {
  assert.equal(call.body,calls[firstAttempt].body,'Unchanged manual retry must retain exact original body');
  assert.equal(call.headers['Idempotency-Key'],calls[firstAttempt].headers['Idempotency-Key']);
}
responses=[new Error('lost'),new Error('lost'),new Error('lost')];
await assert.rejects(()=>context.submitLeadToBackend(unresolved));
const oldKey=calls.at(-1).headers['Idempotency-Key'];
responses=[{status:201,body:{receipt:'new-contact-receipt',event_id:'new-event'}}];
await context.submitLeadToBackend({...unresolved,phone:'0901234501'});
assert.notEqual(calls.at(-1).headers['Idempotency-Key'],oldKey,'Editing contact inputs must start a new request');
console.log('Manual retry: refreshed quote/session preserve body and key; edited phone creates a new request.');
// A later 4xx cannot disprove a commit whose earlier response was lost.
responses=[new Error('lost'),new Error('lost'),new Error('lost')];
await assert.rejects(()=>context.submitLeadToBackend(unresolved));
const uncertainKey=calls.at(-1).headers['Idempotency-Key'];
responses=[{status:429,body:{code:'RATE_LIMITED'}}];
await assert.rejects(()=>context.submitLeadToBackend(unresolved));
responses=[{status:200,body:{receipt:'original',event_id:'original'}}];
await context.submitLeadToBackend({...unresolved,quote_token:'another-token'});
assert.equal(calls.at(-1).headers['Idempotency-Key'],uncertainKey);
console.log('Uncertain retry: later 4xx does not discard an unresolved original key.');
