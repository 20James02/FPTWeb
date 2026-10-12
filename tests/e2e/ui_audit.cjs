/* Visual audit against isolated real SQL/cookies. Never use against cloud data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const origin=process.env.PAGEFPT_QA_ORIGIN||'http://127.0.0.1:8099';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Loopback required');
const dir='.local/qa/ui-audit';fs.mkdirSync(dir,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 const errors=[],report={pages:[],dialogs:[],issues:[],errors};
 page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
 await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
 async function inspect(label){
  await page.waitForTimeout(150);
  const data=await page.evaluate(()=>({
   width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
   unlabelled:Array.from(document.querySelectorAll('input,select,textarea')).filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&el.getAttribute('aria-hidden')!=='true'&&!el.closest('[inert]')).filter(el=>!el.labels?.length&&!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!['hidden','submit','button'].includes(el.type)).map(el=>el.id||el.outerHTML.slice(0,120)),
   underlined:Array.from(document.querySelectorAll('.sidebar-nav a')).filter(el=>getComputedStyle(el).textDecorationLine!=='none').map(el=>el.textContent.trim())
  }));
  report.pages.push({label,...data});
  if(data.scrollWidth>data.width+1)report.issues.push({label,kind:'overflow',width:data.width,scrollWidth:data.scrollWidth});
  if(data.unlabelled.length)report.issues.push({label,kind:'unlabelled',fields:data.unlabelled});
  assert.deepEqual(data.underlined,[],label+' sidebar underline');
  await page.screenshot({path:dir+'/'+label+'.png',fullPage:!label.includes('editor')&&!label.includes('quiz')&&!label.includes('compare')&&!label.includes('confirmation')&&!label.includes('mega')&&!label.includes('form')&&!label.includes('navigation')});
 }
 async function inspectDialog(id,label){
  const dialog=page.locator('#'+id);await dialog.waitFor({state:'visible'});
  const box=await dialog.boundingBox();const size=page.viewportSize();
  const center=Math.abs(box.x+box.width/2-size.width/2)<2;
  const fits=box.y>=0&&box.x>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1;
  report.dialogs.push({label,box,center,fits});
  if(!center||!fits)report.issues.push({label,kind:'dialog-position',box});
  await inspect(label);await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 }
 try{
  await page.goto(origin+'/admin/login');await inspect('admin-login');
  await page.evaluate(()=>switchLoginMode('forgot'));await inspect('admin-recovery-account');
  await page.evaluate(()=>goToForgotStep(2));await inspect('admin-recovery-code');
  await page.evaluate(()=>goToForgotStep(3));await inspect('admin-recovery-password');
  await page.evaluate(()=>switchLoginMode('login'));
  await page.locator('#login-email').fill('qa-admin@example.test');await page.locator('#login-password').fill('qa-only-password');await page.locator('#btn-submit-login').click();
  await page.locator('#otp-1').waitFor({state:'visible'});await inspect('admin-mfa');
  for(const[i,digit]of Array.from('123456').entries())await page.locator('#otp-'+(i+1)).fill(digit);
  await page.locator('#btn-verify-otp').click();await page.waitForURL('**/admin/dashboard');
  const leads=await (await page.request.get(origin+'/api/v1/admin/leads?limit=1')).json();
  const lead=leads.items?.[0]||leads.data?.[0];
  assert.ok(lead?.id,'Fixture lead required for detail audit');
  const paths=['/admin/dashboard','/admin/leads','/admin/leads/detail?id='+lead.id,'/admin/pricing','/admin/reports','/admin/settings','/admin/marketing','/admin/content','/admin/operations'];
  for(const path of paths){
   await page.setViewportSize({width:1440,height:1000});await page.goto(origin+path);await page.waitForTimeout(350);
   const name=path.split('?')[0].replaceAll('/','-').slice(1);await inspect(name+'-desktop');
   for(const width of [360,390,768]){await page.setViewportSize({width,height:900});await inspect(name+'-'+width);}
   await page.setViewportSize({width:1440,height:1000});
   if(path==='/admin/settings'){
    await page.locator('#setting-contact-phone').fill('0912.345.678');
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/v1/system/display-settings')&&r.request().method()==='POST');
    await page.locator('#btn-save-display-settings').click();assert.equal((await saved).status(),200);
    await page.reload();assert.equal(await page.locator('#setting-contact-phone').inputValue(),'0912.345.678');
    await page.locator('#setting-contact-phone').fill('0868.247.625');await page.locator('#btn-save-display-settings').click();
    await page.waitForFunction(()=>document.getElementById('display-settings-state').textContent.includes('Đã lưu'));
   }
   if(path==='/admin/pricing'){
    await page.waitForFunction(()=>availablePlans.length>0);
    for(const [fn,id]of [['openPlanDialog','plan-dialog'],['openCreatePriceModal','create-price-backdrop'],['openLocationDialog','location-dialog'],['openCsvModal','csv-modal-backdrop'],['openGeographyDialog','geography-dialog']]){
     await page.evaluate(fn=>window[fn](),fn);await inspectDialog(id,'pricing-'+id+'-desktop');
     await page.setViewportSize({width:360,height:800});await page.evaluate(fn=>window[fn](),fn);await inspectDialog(id,'pricing-'+id+'-mobile');await page.setViewportSize({width:1440,height:1000});
    }
   }
   if(['/admin/marketing','/admin/content','/admin/operations'].includes(path)){
    await page.locator('#workspace-tabs button').first().waitFor();
    const tabs=await page.locator('#workspace-tabs button').evaluateAll(els=>els.map(el=>el.dataset.tab));
    for(const tab of tabs){
     await page.locator(`#workspace-tabs [data-tab="${tab}"]`).click();await page.waitForTimeout(120);
     await inspect(name+'-'+tab);
     if(await page.locator('#workspace-create').isVisible()){
      await page.locator('#workspace-create').click();await inspectDialog('workspace-editor',name+'-'+tab+'-editor');
      await page.setViewportSize({width:360,height:800});await page.locator('#workspace-create').click();await inspectDialog('workspace-editor',name+'-'+tab+'-editor-mobile');await page.setViewportSize({width:1440,height:1000});
     }
    }
   }
  }
  await page.goto(origin+'/admin/settings');await page.evaluate(()=>toggleAdminTheme());await inspect('admin-settings-dark');await page.evaluate(()=>toggleAdminTheme());
  for(const path of ['/','/san-pham/internet-gia-dinh','/san-pham/combo-fpt-play','/san-pham/camera-fpt','/khuyen-mai','/chinh-sach-bao-mat']){
   await page.goto(origin+path);await page.waitForTimeout(200);
   const name=path==='/'?'home':path.replaceAll('/','-').slice(1);
   const phones=await page.locator('a[href^="tel:"]').evaluateAll(els=>els.map(el=>el.getAttribute('href')));assert.ok(phones.length);assert.ok(phones.every(href=>href==='tel:0868247625'));
   for(const width of [1440,1024,768,390,360]){await page.setViewportSize({width,height:900});await inspect('client-'+name+'-'+width);}
   await page.evaluate(()=>openBottomSheet('Tư vấn dịch vụ','','','internet'));await inspect('client-'+name+'-form');await page.evaluate(()=>closeBottomSheet());
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/');
  for(let i=0;i<3;i++){await page.locator('.main-nav-desktop button.nav-link-btn').nth(i).click();await page.locator('.main-nav-desktop .nav-item.is-open .consult-device-image').waitFor({state:'visible'});await inspect('client-mega-'+i);}
  await page.evaluate(()=>openQuizModal());await inspect('client-quiz-step1');
  await page.evaluate(()=>selectQuizAnswer(1,'family'));await inspect('client-quiz-step2');
  await page.evaluate(()=>selectQuizAnswer(2,'apartment'));await inspect('client-quiz-step3');
  await page.evaluate(()=>selectQuizAnswer(3,'few'));await inspect('client-quiz-result');await page.evaluate(()=>closeQuizModal());
  await page.evaluate(()=>{const plan=getPublishedPlans()[0];toggleCompare(plan.id,plan.name,'Tư vấn','Giá theo địa bàn','Theo gói');});await inspect('client-compare');await page.evaluate(()=>closeCompareModal());
  await page.evaluate(()=>openConfirmationModal('QA-RECEIPT'));await inspect('client-confirmation');await page.evaluate(()=>closeConfirmationModal());
  await page.setViewportSize({width:390,height:844});await page.locator('.btn-mobile-menu-toggle').click();await page.locator('[aria-controls="acc-net"]').click();await inspect('client-mobile-navigation');
  console.log(JSON.stringify({pages:report.pages.length,dialogs:report.dialogs.length,issues:report.issues,errors},null,2));
  assert.deepEqual(report.issues,[]);assert.deepEqual(errors,[]);
 }finally{fs.writeFileSync(dir+'/audit.json',JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
