import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const proof of ['123456','1234567','https://project.supabase.co/auth/v1/verify?token=abc']){
 const nodes=Object.fromEntries(['forgot-otp-code','new-password','confirm-new-password','recovery-totp','btn-forgot-step2-submit','btn-forgot-step3-submit','login-email','login-password'].map(id=>[id,{value:''}]));
 nodes['forgot-otp-code'].value=proof;
 nodes['new-password'].value=nodes['confirm-new-password'].value='QA-password-123';
 let step,submitted;
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},showToast(){},goToForgotStep:value=>step=value,switchLoginMode(){},currentForgotAccount:'qa@example.test',recoveryRequest:async(path,payload)=>{if(path==='/verify')return {verified:true};submitted=payload;return {changed:true};}});
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/recovery.js','utf8'),context);
 vm.runInContext("currentRecoveryChallenge='11111111-1111-4111-8111-111111111111'",context);
 await context.handleForgotStep2({preventDefault(){}});
 assert.equal(step,proof==='123456'?3:undefined,'Only six digits may reach password entry');
 if(proof!=='123456')continue;
 await context.handleForgotStep3({preventDefault(){}});
 assert.equal(submitted.otp,'123456');assert.equal(submitted.challenge_id,'11111111-1111-4111-8111-111111111111');
 assert.equal(submitted.email,'qa@example.test');assert.equal(submitted.recovery_link,undefined);
 assert.equal(nodes['forgot-otp-code'].value,'');
}
console.log('Recovery requires six Telegram digits and a server challenge; no links.');

{
 const nodes=Object.fromEntries(['forgot-account','btn-forgot-step1-submit','forgot-otp-code','recovery-code-help'].map(id=>[id,{value:'',textContent:''}]));
 nodes['forgot-account'].value='staff@example.test';
 const toasts=[];let requestCount=0;
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},showToast:text=>toasts.push(text),goToForgotStep(){},startForgotOtpCountdown(){},currentForgotAccount:'',recoveryRequest:async()=>({accepted:true,challenge_id:requestCount++===0?'11111111-1111-4111-8111-1111abcdef12':'22222222-2222-4222-8222-222212345678'})});
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/recovery.js','utf8'),context);
 await context.handleForgotStep1();
 assert.match(nodes['recovery-code-help'].textContent,/ABCDEF12/);
 assert.match(nodes['recovery-code-help'].textContent,/quản trị/);
 nodes['forgot-otp-code'].value='123456';
 await context.resendForgotOtp();
 assert.match(nodes['recovery-code-help'].textContent,/12345678/);
 assert.ok(!nodes['recovery-code-help'].textContent.includes('ABCDEF12'));
 assert.equal(nodes['forgot-otp-code'].value,'');
 assert.ok(toasts.every(text=>!text.includes('đã liên kết')));
}
console.log('Shared Telegram recovery shows a matching request reference and updates it on resend.');

for(const outcome of ['wrong','network','string','correct','cancelled','edited']){
 const nodes=Object.fromEntries(['forgot-otp-code','btn-forgot-step2-submit','recovery-code-error'].map(id=>[id,{value:'',textContent:'',hidden:true,attrs:{},setAttribute(k,v){this.attrs[k]=v},focus(){}}]));
 nodes['forgot-otp-code'].value='123456';
 let step,resolve,calls=0;
 const response=new Promise(r=>resolve=r);
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},showToast(){},goToForgotStep:n=>step=n,currentForgotAccount:'qa@example.test',loginModeGeneration:1,recoveryRequest:async(path,payload)=>{calls++;assert.equal(path,'/verify');assert.equal(payload.otp,'123456');await response;if(outcome==='network')throw Error('Máy chủ tạm thời không phản hồi');return {verified:outcome==='string'?'true':outcome!=='wrong'};}});
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/recovery.js','utf8'),context);
 vm.runInContext("currentRecoveryChallenge='11111111-1111-4111-8111-111111111111'",context);
 const pending=context.handleForgotStep2();
 assert.equal(step,undefined,'Never open password entry before the server verifies the code');
 assert.equal(nodes['btn-forgot-step2-submit'].disabled,true);
 await context.handleForgotStep2();assert.equal(calls,1,'Block repeated submits while verifying');
 if(outcome==='cancelled')context.loginModeGeneration++;
 if(outcome==='edited')nodes['forgot-otp-code'].value='999999';
 resolve();await pending;
 assert.equal(step,outcome==='correct'?3:undefined);
 assert.equal(nodes['btn-forgot-step2-submit'].disabled,false);
 if(['wrong','network','string'].includes(outcome)){
  assert.equal(nodes['recovery-code-error'].hidden,false);
  assert.equal(nodes['forgot-otp-code'].attrs['aria-invalid'],'true');
 }
}
console.log('Only server-verified codes advance; invalid, pending, stale and failed requests stay on step two.');

for(const fails of [false,true]){
 const nodes=Object.fromEntries(['forgot-step-1','forgot-step-2','forgot-step-3','tab-forgot-btn','forgot-account','forgot-otp-code','btn-forgot-step2-submit','recovery-code-error'].map(id=>[id,{style:{display:'none'},value:'',hidden:true,textContent:'',setAttribute(){},focus(){this.focused=true}}]));
 nodes['forgot-step-2'].style.display='block';nodes['forgot-otp-code'].value='123456';
 let release;
 const wait=new Promise(r=>release=r);
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},setTimeout(){},startForgotOtpCountdown(){},showToast(){},currentForgotAccount:'qa@example.test',loginModeGeneration:1,recoveryRequest:async()=>{await wait;if(fails)throw Error('Mã sai');return {verified:true}}});
 const navigation=fs.readFileSync('src/pagefpt/templates/admin/login.html','utf8').match(/function goToForgotStep\(step\) \{[\s\S]*?\n  \}/);
 assert.ok(navigation);vm.runInContext(navigation[0],context);
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/recovery.js','utf8'),context);
 vm.runInContext("currentRecoveryChallenge='11111111-1111-4111-8111-111111111111'",context);
 const pending=context.handleForgotStep2();context.goToForgotStep(1);release();await pending;
 assert.equal(nodes['forgot-step-1'].style.display,'block','Returning to email must invalidate pending code verification');
 assert.equal(nodes['forgot-step-3'].style.display,'none');
 assert.equal(nodes['recovery-code-error'].hidden,true);
 assert.ok(!nodes['forgot-otp-code'].focused,'A stale error cannot focus a hidden field');
}
console.log('Returning to email ignores both successful and failed pending verification responses.');
