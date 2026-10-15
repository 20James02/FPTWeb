import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for(const proof of ['123456','1234567','https://project.supabase.co/auth/v1/verify?token=abc']){
 const nodes=Object.fromEntries(['forgot-otp-code','new-password','confirm-new-password','recovery-totp','btn-forgot-step3-submit','login-email','login-password'].map(id=>[id,{value:''}]));
 nodes['forgot-otp-code'].value=proof;
 nodes['new-password'].value=nodes['confirm-new-password'].value='QA-password-123';
 let step,submitted;
 const context=vm.createContext({document:{getElementById:id=>nodes[id]},showToast(){},goToForgotStep:value=>step=value,switchLoginMode(){},currentForgotAccount:'qa@example.test',recoveryRequest:async(path,payload)=>{submitted=payload;return {changed:true};}});
 vm.runInContext(fs.readFileSync('src/pagefpt/static/js/admin/recovery.js','utf8'),context);
 vm.runInContext("currentRecoveryChallenge='11111111-1111-4111-8111-111111111111'",context);
 context.handleForgotStep2({preventDefault(){}});
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
