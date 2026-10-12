const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin=process.env.PAGEFPT_QA_ORIGIN || 'http://127.0.0.1:8095';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw Error('Loopback fixture required');
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.route('**/api/v1/regions/hierarchy',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
  try {
    await page.goto(origin+'/');
    await page.evaluate(()=>openBottomSheet());
    const visibleFields=await page.locator('#lead-intake-form input:not([type=checkbox]), #lead-intake-form select, #lead-intake-form textarea').evaluateAll(nodes=>nodes.filter(node=>node.getClientRects().length && getComputedStyle(node).visibility!=='hidden' && getComputedStyle(node).opacity!=='0').map(node=>node.id));
    assert.deepEqual(visibleFields,['lead-name','lead-phone','lead-address'],'Only the requested three contact fields appear');
    for (const width of [360,390,430,1440]) {
      await page.setViewportSize({width,height:844});
      await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1);
      assert.ok(await page.locator('#btn-submit-lead').evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;}),'Submit is visible at '+width);
    }
    await page.setViewportSize({width:390,height:844});
    await page.locator('#lead-name').fill('QA Khách kiểm thử');
    await page.locator('#lead-phone').fill('0901234567');
    await page.locator('#lead-address').fill('QA Số 12, đường thử nghiệm, phường thử nghiệm, tỉnh thử nghiệm');
    await page.locator('#lead-consent').check();
    let failedPayload;
    await page.route('**/api/v1/leads',route=>{
      failedPayload=route.request().postDataJSON();
      return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'VALIDATION_ERROR',message:'Synthetic failure',fields:{}})});
    });
    await page.locator('#btn-submit-lead').click();
    await page.waitForFunction(()=>!document.getElementById('btn-submit-lead').disabled);
    assert.equal(failedPayload.name,'QA Khách kiểm thử');
    assert.equal(failedPayload.installation_address,'QA Số 12, đường thử nghiệm, phường thử nghiệm, tỉnh thử nghiệm');
    assert.equal(failedPayload.region_id,null,'A missing published geography must not block a consultation');
    assert.equal(await page.locator('#lead-name').inputValue(),'QA Khách kiểm thử');
    assert.equal(await page.locator('#lead-phone').inputValue(),'0901234567');
    await page.unroute('**/api/v1/leads');
    const responsePromise=page.waitForResponse(r=>r.url()===origin+'/api/v1/leads' && r.request().method()==='POST');
    await page.locator('#btn-submit-lead').click();
    const response=await responsePromise;
    assert.equal(response.status(),201,await response.text());
    const receipt=(await response.json()).receipt;
    await page.locator('#confirmation-backdrop.active').waitFor();
    assert.equal(await page.locator('#receipt-id-val').textContent(),receipt);
    await page.evaluate(()=>{closeConfirmationModal();openBottomSheet();});
    assert.equal(await page.locator('#lead-address').inputValue(),'');
    assert.deepEqual(errors,[]);
    await page.waitForFunction(()=>!document.querySelector('#toast-container .toast'));
    fs.mkdirSync('.local/qa',{recursive:true});
    await page.screenshot({path:'.local/qa/short-lead-form.png'});
    console.log('Short form passed: exactly three fields, four widths, free-text address, retry preserves values, real SQL receipt.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
