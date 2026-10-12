import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync('src/pagefpt/templates/admin/login.html', 'utf8');
const source = html.slice(html.indexOf('  async function handlePasswordLogin'), html.indexOf('  </script>', html.indexOf('  async function handlePasswordLogin')));
for (const handler of ['handlePasswordLogin', 'handleOtpVerification']) {
  const nodes = {'login-email': {value: 'qa@example.test'}, 'login-password': {value: 'synthetic'}, 'login-factor': {value: 'backup-factor'}, 'btn-submit-login': {}, 'btn-login-text': {}, 'btn-verify-otp': {}};
  const location = {};
  let args;
  const context = vm.createContext({document: {getElementById: id => nodes[id]}, window: {location}, otpInputs: Array.from('123456', value => ({value})), showToast() {}, setTimeout: fn => fn(), loginWithCredentials: async (...values) => {args=values; return {success: true};}});
  vm.runInContext('let loginModeGeneration = 0;\n' + source, context);
  await context[handler]({preventDefault() {}});
  assert.equal(location.href, '/admin', handler + ' must enter the server permission resolver');
  if(handler==='handleOtpVerification') assert.equal(args[3], 'backup-factor', 'The selected backup device must reach the backend');
}
console.log('Password and MFA login enter authenticated role-aware landing.');
