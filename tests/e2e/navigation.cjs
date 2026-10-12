const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.PAGEFPT_QA_ORIGIN||'http://127.0.0.1:8099';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Loopback required');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:process.env.PAGEFPT_QA_MOTION||'reduce'});
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 try{
  await page.goto(origin+'/');
  const firstTrigger=page.locator('.main-nav-desktop button.nav-link-btn').first();
  await firstTrigger.focus();await page.keyboard.press('ArrowDown');
  await page.waitForFunction(()=>document.activeElement.closest('.mega-menu')!==null);
  await page.keyboard.press('Escape');
  for(const [i,service] of ['internet','combo','camera'].entries()){
   const trigger=page.locator('.main-nav-desktop button.nav-link-btn').nth(i);
   await trigger.focus();await page.keyboard.press('Enter');
   assert.equal(await trigger.getAttribute('aria-expanded'),'true');
   const menu=page.locator('#'+await trigger.getAttribute('aria-controls'));
   await menu.locator('.consult-device-image').waitFor({state:'visible'});
   await menu.locator('.btn-select-plan').click();
   assert.equal(await page.evaluate(()=>selectedServiceId),service);
   await page.evaluate(()=>closeBottomSheet());
   await trigger.click();await page.keyboard.press('Escape');
   assert.equal(await trigger.getAttribute('aria-expanded'),'false');
  }
  await page.setViewportSize({width:390,height:844});
  const toggle=page.locator('.btn-mobile-menu-toggle');await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  const drawer=page.locator('#mobile-nav-drawer');
  assert.equal(await drawer.getAttribute('aria-hidden'),'false');
  await drawer.getByRole('button',{name:'Internet Cáp Quang',exact:true}).click();
  await drawer.locator('#acc-net .consult-device-image').waitFor({state:'visible'});
  await drawer.locator('#acc-net .mobile-consult-card button').click();
  assert.equal(await drawer.getAttribute('aria-hidden'),'true');
  assert.equal(await page.evaluate(()=>selectedServiceId),'internet');
  await page.evaluate(()=>closeBottomSheet());
  await toggle.click();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.closest('#mobile-nav-drawer')!==null),true);
  await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await toggle.evaluate(el=>el===document.activeElement),true);
  for(const [open,id]of [['openBottomSheet','bottom-sheet-backdrop'],['openQuizModal','quiz-backdrop'],['openCompareModal','compare-backdrop'],['openConfirmationModal','confirmation-backdrop']]){
   await page.evaluate(open=>window[open](),open);
   await page.locator('#'+id).waitFor({state:'visible'});
   await page.waitForTimeout(50);
   assert.equal(await page.evaluate(id=>document.activeElement.closest('#'+id)!==null,id),true,'Focus stays in '+id);
   await page.evaluate(id=>{const items=Array.from(document.querySelectorAll('#'+id+' button, #'+id+' a[href], #'+id+' input')).filter(el=>el.tabIndex>=0&&!el.disabled&&!el.closest('[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');items.at(-1)?.focus();},id);
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(id=>document.activeElement.closest('#'+id)!==null,id),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('#'+id).getAttribute('aria-hidden'),'true');
  }
  console.log('Passed: three desktop service cards, keyboard menus, mobile illustration, service routing, focus trap and Escape.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
