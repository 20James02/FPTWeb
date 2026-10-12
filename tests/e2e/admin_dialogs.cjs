const{chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.PAGEFPT_QA_ORIGIN||'http://127.0.0.1:8099';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Loopback required');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
 page.setDefaultTimeout(10000);
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 try{
  await page.goto(origin+'/admin/login');
  const login=await page.request.post(origin+'/api/v1/auth/session',{data:{email:'qa-admin@example.test',password:'qa-only-password',otp:'123456'},headers:{Origin:origin}});assert.equal(login.status(),200);
  await page.goto(origin+'/admin/leads');
  const lead=(await(await page.request.get(origin+'/api/v1/admin/leads?limit=1')).json()).items[0];
  for(const width of [1440,360]){
   await page.setViewportSize({width,height:900});
   for(const kind of ['confirm','reason','assignee']){
    await page.evaluate(({kind,lead})=>{
     window.qaDialogValue=undefined;
     if(kind==='confirm')adminConfirm('Thực thi yêu cầu dữ liệu này? Thao tác xóa sẽ không thể hoàn tác.',true).then(value=>window.qaDialogValue=value);
     if(kind==='reason')adminAskText('Lý do cập nhật hồ sơ').then(value=>window.qaDialogValue=value);
     if(kind==='assignee')void adminChooseAssignee([lead]);
    },{kind,lead});
    const dialog=page.locator('dialog.admin-dialog[open]');await dialog.waitFor({state:'visible'});
    const box=await dialog.boundingBox();assert.ok(Math.abs(box.x+box.width/2-width/2)<2);assert.ok(box.y>=0&&box.y+box.height<=900);
    assert.ok(await dialog.getAttribute('aria-label'));
    fs.mkdirSync('.local/qa/ui-audit',{recursive:true});await page.screenshot({path:'.local/qa/ui-audit/admin-'+kind+'-'+width+'.png'});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog.admin-dialog'));
    if(kind!=='assignee')assert.equal(await page.evaluate(()=>window.qaDialogValue),kind==='confirm'?false:null);
   }
  }
  await page.evaluate(()=>{adminConfirm('Xác nhận thao tác kiểm thử').then(value=>window.qaDialogValue=value);});
  await page.locator('dialog.admin-dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();
  await page.waitForFunction(()=>window.qaDialogValue===true);
  assert.equal(await page.evaluate(()=>window.qaDialogValue),true);
  await page.goto(origin+'/admin/pricing');await page.waitForFunction(()=>availablePlans.length>0);
  for(const width of [1440,360]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>confirmPricingRetire('plans',availablePlans[0]));
   const dialog=page.locator('#pricing-confirm');await dialog.waitFor({state:'visible'});
   const box=await dialog.boundingBox();assert.ok(Math.abs(box.x+box.width/2-width/2)<2);
   await page.screenshot({path:'.local/qa/ui-audit/admin-pricing-confirm-'+width+'.png'});
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  }
  console.log('Passed: confirm/cancel, reason and assignment dialogs, accessible names, Escape, desktop/mobile positioning.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
