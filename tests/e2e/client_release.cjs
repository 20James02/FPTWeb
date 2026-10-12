const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.PAGEFPT_QA_ORIGIN || 'http://127.0.0.1:8094';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw Error('Loopback required');
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let uploaded = false, releaseUpload, markUploadStarted;
  const uploadStarted = new Promise(resolve => {markUploadStarted=resolve;});
  await page.route('**/*', route => {
    const request=route.request(), url=request.url();
    if (url.startsWith(origin+'/')) return route.continue();
    if (url.startsWith('https://media.example.test/uploads/')) {
      if (request.method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'PUT','access-control-allow-headers':'content-type'}});
      assert.equal(request.method(),'PUT');
      assert.equal(request.headers()['content-type'],'image/png');
      assert.deepEqual(request.postDataBuffer(),fs.readFileSync('.local/qa/package-upload.png'));
      uploaded=true;
      markUploadStarted();
      return new Promise(resolve => {releaseUpload=()=>route.fulfill({status:200,headers:{'access-control-allow-origin':origin}}).then(resolve);});
    }
    if (url.startsWith('https://media.example.test/images/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f26f21"/><text x="80" y="400" font-size="70" fill="white">QA Package</text></svg>'});
    return route.abort();
  });
  try {
    await page.goto(origin+'/admin/login');
    assert.equal(await page.locator('#tab-otp-btn').isVisible(), false, 'OTP must be hidden before MFA challenge');
    assert.equal(await page.locator('#tab-forgot-btn').isVisible(), false, 'Recovery tab must be hidden initially');
    await page.getByRole('button', {name:'Quên mật khẩu?',exact:true}).click();
    await page.locator('#forgot-account').waitFor({state:'visible'});
    await page.getByRole('button', {name:'← Quay lại đăng nhập',exact:true}).first().click();
    let releaseLogin, markLoginStarted;
    const loginStarted = new Promise(resolve => {markLoginStarted=resolve;});
    await page.route('**/api/v1/auth/session',route=>new Promise(resolve=>{
      releaseLogin=()=>route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'MFA_REQUIRED'})}).then(resolve);
      markLoginStarted();
    }));
    await page.locator('#login-email').fill('qa-admin@example.test');
    await page.locator('#login-password').fill('qa-only-password');
    await page.locator('#btn-submit-login').click();
    await loginStarted;
    await page.getByRole('button',{name:'Quên mật khẩu?',exact:true}).click();
    await releaseLogin();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#form-forgot-password').isVisible(),true,'Late MFA response must not replace recovery screen');
    assert.equal(await page.locator('#form-otp-verify').isVisible(),false);
    await page.unroute('**/api/v1/auth/session');
    await page.getByRole('button',{name:'← Quay lại đăng nhập',exact:true}).first().click();
    await page.locator('#login-email').fill('qa-admin@example.test');
    await page.locator('#login-password').fill('qa-only-password');
    await page.locator('#btn-submit-login').click();
    await page.locator('#otp-1').waitFor({state:'visible'});
    assert.equal(await page.locator('#tab-otp-btn').isVisible(), true);
    await page.getByRole('button',{name:'← Quay lại đăng nhập bằng mật khẩu',exact:true}).click();
    assert.equal(await page.locator('#btn-submit-login').isEnabled(), true, 'Back from MFA must allow a new login');
    await page.locator('#btn-submit-login').click();
    await page.locator('#otp-1').waitFor({state:'visible'});
    for (const [index,digit] of Array.from('123456').entries()) await page.locator('#otp-'+(index+1)).fill(digit);
    await page.locator('#btn-verify-otp').click();
    await page.waitForURL('**/admin/dashboard');
    await page.goto(origin+'/admin/pricing');
    await page.waitForFunction(() => availablePlans.length > 0);
    await page.evaluate(() => pricingTab('plans'));
    await page.locator('#pricing-add').click();
    await page.locator('#plan-name').fill('QA Image Package');
    await page.locator('#plan-code').fill('qa-image-browser');
    await page.waitForFunction(() => document.getElementById('plan-image-id').options.length > 1);
    await page.locator('#plan-image-id').selectOption({index:1});
    await page.locator('#plan-image-alt').fill('QA package illustration');
    assert.equal(await page.locator('#plan-image-preview').isVisible(), true);
    await page.locator('#plan-image-file').setInputFiles('.local/qa/package-upload.png');
    await uploadStarted;
    assert.equal(await page.getByRole('button',{name:'Bỏ ảnh',exact:true}).isDisabled(),true,'Avoid clearing an image while upload is completing');
    await releaseUpload();
    await page.waitForFunction(() => document.getElementById('plan-image-status').textContent.startsWith('Ảnh đã sẵn sàng'));
    assert.equal(uploaded,true);
    const saved = page.waitForResponse(r => r.url().endsWith('/api/v1/admin/plans') && r.request().method()==='POST');
    await page.locator('#plan-form button[type=submit]').click();
    const plan = await (await saved).json();
    assert.ok(plan.payload.image_url);
    await page.evaluate(async plan => {
      const response = await adminFetch('/api/v1/admin/plans/'+plan.id+'/publish', {
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:plan.version}),
      });
      if (!response.ok) throw Error(await response.text());
    },plan);
    await page.goto(origin+'/');
    const img = page.locator('.plan-card-image[alt="QA package illustration"]');
    assert.equal(await img.count(), 1);
    assert.equal(await img.getAttribute('loading'), 'lazy');
    for (const width of [360,390,430,1440]) {
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth+1);
    }
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => { currentMultitaskIndex=Array.from(document.querySelectorAll('.plan-card-3d-wrapper')).findIndex(card=>card.querySelector('.plan-card-image')); renderMultitaskState(false); });
    await img.scrollIntoViewIfNeeded();
    assert.equal(await img.isVisible(),true);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('.plan-card-image')).every(img=>img.complete && img.naturalWidth>0));
    assert.deepEqual(errors, []);
    fs.mkdirSync('.local/qa',{recursive:true});
    await page.screenshot({path:'.local/qa/client-plan-images.png'});
    console.log('Passed: progressive login/MFA/back, image selector/preview/save/publish, public cards and four responsive widths.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
