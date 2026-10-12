const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const origin=process.env.PAGEFPT_QA_ORIGIN || 'http://127.0.0.1:8097';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Loopback fixture required');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.goto(origin+'/admin/login');await page.getByRole('button',{name:'Quên mật khẩu?'}).click();
  await page.fill('#forgot-account','qa-admin@example.test');
  const requested=page.waitForResponse(r=>r.url()===origin+'/api/v1/auth/recovery' && r.request().method()==='POST');
  await page.click('#btn-forgot-step1-submit');
  const challengeId=(await (await requested).json()).challenge_id;
  await page.locator('#forgot-step-2').waitFor();
  // Read the encrypted synthetic fixture code using the test DB credentials.
  // No fixed/randomness override or test endpoints in production code.
  const code=execFileSync('.venv/bin/python',['-c',`
import psycopg,sys
from tests.conftest import local_server_dsn
from psycopg.conninfo import make_conninfo
from pagefpt.core.crypto import Crypto
base=local_server_dsn()
with psycopg.connect(base) as db:
 names=[r[0] for r in db.execute("SELECT datname FROM pg_database WHERE datname LIKE 'pagefpt_test_%'").fetchall()]
for name in names:
 with psycopg.connect(make_conninfo(base,dbname=name)) as db:
  row=db.execute("SELECT code_ciphertext FROM private.telegram_recovery WHERE id=%s AND state='ready'",[sys.argv[1]]).fetchone()
  if row:print(Crypto('e'*32,'m'*32,'t'*32).decrypt(row[0]));break
`,challengeId],{env:{...process.env,PYTHONPATH:'src:.'},encoding:'utf8'}).trim();
  assert.match(code,/^[0-9]{6}$/);
  await page.fill('#forgot-otp-code',code);
  assert.equal(await page.locator('#forgot-otp-code').getAttribute('inputmode'),'numeric');
  for(const width of [360,390,430,1440]){
   await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  }
  await page.click('#btn-forgot-step2-submit');await page.locator('#forgot-step-3').waitFor();
  await page.fill('#new-password','QA-recovered-password-123');await page.fill('#confirm-new-password','QA-recovered-password-123');await page.fill('#recovery-totp','123456');
  const received=page.waitForResponse(r=>r.url()===origin+'/api/v1/auth/recovery/reset' && r.request().method()==='POST');
  await page.click('#btn-forgot-step3-submit');const response=await received;assert.equal(response.status(),200,await response.text());assert.equal((await response.json()).changed,true);
  assert.equal(response.request().postDataJSON().otp,code);assert.ok(response.request().postDataJSON().challenge_id);assert.equal(response.request().postDataJSON().recovery_link,undefined);
  await page.waitForFunction(()=>document.getElementById('forgot-otp-code').value==='');
  assert.equal(await page.inputValue('#new-password'),'');assert.deepEqual(errors,[]);
  console.log('Telegram code browser passed: six digits, four widths, MFA, real SQL reset audit and cleared credentials.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
