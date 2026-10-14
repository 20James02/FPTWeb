// Runs the real frontend against tests.e2e.integrated_server on loopback only.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.PAGEFPT_QA_ORIGIN || 'http://127.0.0.1:8092';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Disposable loopback fixture required');
const output = process.env.PAGEFPT_QA_OUTPUT || 'docs/qa/2026-10-01/browser-integration.json';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Ho_Chi_Minh',reducedMotion:'reduce'});
 const report={environment:'Local Chrome + disposable PostgreSQL; Supabase Auth HTTP simulated; no cloud calls',checks:[],page_errors:[],api_errors:[],viewports:[]};
 let leadId, priceId, planId, regionId;
 fs.mkdirSync(require('node:path').dirname(output),{recursive:true});
 async function assertAnalytics(){
  await page.waitForFunction(()=>document.querySelectorAll('#analytics-kpis .kpi-value').length===4);
  const params=await page.evaluate(()=>new URLSearchParams({start:document.getElementById('analytics-start').value,end:document.getElementById('analytics-end').value}).toString());
  const data=await api('/api/v1/admin/reports/analytics?'+params);
  assert.equal(data.status,200);
  assert.equal(await page.locator('#analytics-kpis .kpi-value').first().textContent(),data.json.totals.leads.toLocaleString('vi-VN'));
 }
 await context.route('**/*',route=>route.request().url().startsWith(origin+'/') || route.request().url().startsWith('data:') ? route.continue() : route.abort());
 const page=await context.newPage(); page.setDefaultTimeout(10000);
 page.on('pageerror',error=>report.page_errors.push({path:new URL(page.url()).pathname,message:error.message.slice(0,200)}));
 page.on('response',res=>{if(res.url().startsWith(origin+'/api/')&&res.status()>=400)report.api_errors.push({method:res.request().method(),path:new URL(res.url()).pathname,status:res.status()});});
 async function check(name,fn){let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('QA action deadline exceeded (12s)')),12000);})]);report.checks.push({name,status:'passed'});}catch(error){report.checks.push({name,status:'failed',error:String(error.message).slice(0,700)});}finally{clearTimeout(timer);} fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(report.checks.at(-1).status+': '+name);}
 async function api(path,method='GET',body){return await page.evaluate(async({path,method,body})=>{
   const headers={'Content-Type':'application/json'};
   const csrf=document.cookie.split('; ').find(v=>v.startsWith('pagefpt_csrf='));
   if(csrf)headers['X-CSRF-Token']=decodeURIComponent(csrf.slice('pagefpt_csrf='.length));
   const res=await fetch(path,{method,headers,credentials:'same-origin',...(body ? {body:JSON.stringify(body)}:{})});
   return {status:res.status,json:await res.json()};
 },{path,method,body});}
 try{
 await page.goto(origin+'/admin/login');
 await check('guest private API denied',async()=>assert.equal((await api('/api/v1/admin/me')).status,401));
 await check('wrong password rejected without session',async()=>{
  assert.equal((await api('/api/v1/auth/session','POST',{email:'qa-admin@example.test',password:'wrong'})).status,401);
  assert.equal((await context.cookies()).some(c=>c.name==='pagefpt_admin_session'),false);
 });
 await check('login UI requires MFA and keeps session absent',async()=>{
  await page.locator('#login-email').fill('qa-admin@example.test'); await page.locator('#login-password').fill('qa-only-password');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/session')&&r.request().method()==='POST');
  await page.locator('#btn-submit-login').click(); assert.equal((await response).status(),403);
  await page.locator('#form-otp-verify').waitFor({state:'visible'});
  assert.equal((await context.cookies()).some(c=>c.name==='pagefpt_admin_session'),false);
 });
 await check('MFA UI login creates HttpOnly cookie and dashboard hydration',async()=>{
  await page.evaluate(()=>{document.querySelectorAll('.otp-digit-input').forEach((input,i)=>input.value='123456'[i]);});
  await page.locator('#btn-verify-otp').click(); await page.waitForURL('**/admin/dashboard');
  await assertAnalytics();
  assert.equal((await context.cookies()).find(c=>c.name==='pagefpt_admin_session')?.httpOnly,true);
  assert.equal((await api('/api/v1/admin/me')).json.aal,'aal2');
  assert.equal(await page.evaluate(()=>localStorage.getItem('pagefpt_admin_token')),null);
 });
 await check('cookie mutation without CSRF is denied',async()=>{
  const result=await page.evaluate(async()=>{const r=await fetch('/api/v1/system/display-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expected_version:0,runline_text:'must not commit'})});return r.status;});
  assert.equal(result,403);
 });
 await page.goto(origin+'/admin/leads');
 await check('CRM first page and masked PII hydrate',async()=>{
  await page.waitForFunction(()=>typeof crmLoadedLeads!=='undefined'&&crmLoadedLeads.length===30);
  leadId=await page.evaluate(()=>crmLoadedLeads[0].id);
  assert.match(await page.locator('#crm-table-tbody').textContent(),/\*\*\*/);
 });
 await check('CRM pagination loads remaining leads',async()=>{
  const count=(await api('/api/v1/admin/lead-counts')).json.total;
  await page.locator('#btn-load-more').click(); await page.waitForFunction(total=>crmLoadedLeads.length===total,count);
  assert.equal(await page.evaluate(()=>crmLoadedLeads.length),count);
 });
 await check('CRM filter returns real empty state',async()=>{
  await page.evaluate(()=>loadCrmLeads('installed')); assert.match(await page.locator('#crm-table-tbody').textContent(),/Chưa có/);
  await page.evaluate(()=>loadCrmLeads());
 });
 await page.goto(origin+'/admin/leads/detail?id='+leadId);
 await check('detail hydration uses selected lead and safe DTO',async()=>{
  await page.locator('#lead-content-panel').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>currentLead.id),leadId);
  assert.match(await page.locator('#detail-phone-val').textContent(),/\*/);
 });
 await check('explicit PII reveal succeeds with AAL2',async()=>{
  await page.evaluate(()=>handleRevealAction());
  assert.match(await page.locator('#detail-phone-val').textContent(),/^\+84/);
 });
 await check('appointment UI commits accepted kind to SQL',async()=>{
  await page.evaluate(()=>{showAppointmentForm();document.getElementById('new-appointment-time').value='2026-10-02T10:00';document.getElementById('new-appointment-notes').value='synthetic callback';});
  await page.evaluate(()=>submitNewAppointment());
  const appointments=await api('/api/v1/admin/leads/'+leadId+'/appointments');
  assert.equal(appointments.status,200); assert.equal(appointments.json.items.length,1);
  assert.equal(appointments.json.items[0].kind,'callback');
 });
 await check('CRM note is stored and timeline refetches',async()=>{
  await page.evaluate(()=>quickAddNote('synthetic note'));
  const result=await api('/api/v1/admin/leads/'+leadId);
  assert.ok(result.json.activities.some(a=>a.kind==='note'));
  assert.equal(JSON.stringify(result.json.activities).includes('synthetic note'),false);
 });
 await check('assignment and status transition commit real lead versions',async()=>{
  await page.evaluate(()=>handleAutoAssign());
  assert.equal((await api('/api/v1/admin/leads/'+leadId)).json.status,'assigned');
  await page.evaluate(()=>handleStatusTransition('contacting'));
  assert.equal((await api('/api/v1/admin/leads/'+leadId)).json.status,'contacting');
 });
 await check('stale version fails with 409 and leaves state intact',async()=>{
  const result=await api('/api/v1/admin/leads/'+leadId+'/transitions','POST',{expected_version:1,status:'contacted'});
  assert.equal(result.status,409); assert.equal(result.json.code,'VERSION_CONFLICT');
  assert.equal((await api('/api/v1/admin/leads/'+leadId)).json.status,'contacting');
 });
 await check('recompute returns queued rather than fake completion',async()=>{
  const response=await api('/api/v1/admin/leads/'+leadId+'/recompute','POST'); assert.equal(response.status,202);assert.equal(response.json.queued,true);
 });
 await page.goto(origin+'/admin/pricing');
 await check('plan selector hydrates from admin payload wrapper',async()=>{
  await page.waitForFunction(()=>availablePlans.length>0);await page.evaluate(()=>openCreatePriceModal());
  planId=await page.locator('#inp-plan-id option').nth(1).getAttribute('value'); assert.match(planId,/^[0-9a-f-]{36}$/);await page.evaluate(()=>closeCreatePriceModal());
 });
 await check('price create UI commits draft',async()=>{
  const before=await api('/api/v1/admin/prices');const known=new Set(before.json.items.map(p=>p.id));
  await page.evaluate(()=>openCreatePriceModal()); assert.equal(await page.locator('#inp-plan-id').isVisible(),true,'Price modal must expose usable form controls'); await page.locator('#inp-plan-id').selectOption(planId);
  await page.locator('#inp-monthly-vnd').fill('100'); await page.locator('#inp-source').fill('QA synthetic; never commercial');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/admin/prices')&&r.request().method()==='POST');
  await page.locator('#btn-submit-price').click(); const result=await response; assert.equal(result.status(),201);
  const after=await api('/api/v1/admin/prices');priceId=after.json.items.find(p=>!known.has(p.id)&&p.monthly_vnd===100)?.id;
  assert.ok(priceId,'UI-created draft must be visible through the read API');
  await page.locator('[data-price-id="'+priceId+'"]').waitFor();
 });
 if(!priceId){const fixture=await api('/api/v1/admin/prices','POST',{plan_id:planId,scope_kind:'default',scope_id:'00000000-0000-0000-0000-000000000000',billing_months:6,monthly_vnd:100,start:new Date().toISOString(),source:'QA synthetic; API fallback after modal check'});priceId=fixture.json.id;}
 await check('price publish UI commits published snapshot',async()=>{
  const record=(await api('/api/v1/admin/prices/'+priceId)).json;
  await page.evaluate(({id,version})=>publishPriceRecord(id,version),record);
  assert.equal((await api('/api/v1/admin/prices/'+priceId)).json.status,'published');
 });
 await check('public quote matches backend published plan, region and price',async()=>{
  regionId=(await api('/api/v1/regions')).json.items[0].id;
  const quote=await api('/api/v1/quotes','POST',{plan_id:planId,region_id:regionId,billing_months:6});
  assert.equal(quote.json.status,'confirmed');assert.equal(quote.json.initial_total_vnd,600);assert.ok(quote.json.quote_token);
 });
 await check('CSV preview and apply create drafts only',async()=>{
  await page.evaluate(()=>openCsvModal());
  const csv=`plan_id,scope_id,scope_kind,billing_months,monthly_vnd,start,source\n${planId},00000000-0000-0000-0000-000000000000,default,12,100,2026-10-01T00:00:00Z,qa-synthetic`;
  assert.equal(await page.locator('#csv-content-input').isVisible(),true,'CSV modal must expose usable controls'); await page.locator('#csv-content-input').fill(csv);await page.evaluate(()=>handleCsvPreview());
  await page.locator('#btn-csv-apply').waitFor({state:'visible'});await page.evaluate(()=>handleCsvApply());
  assert.ok((await api('/api/v1/admin/prices')).json.items.some(p=>p.billing_months===12&&p.status==='draft'));
 });
 await page.goto(origin+'/admin/reports');
 await check('report funnel is hydrated from real API',async()=>{
  await assertAnalytics();
 });
 await check('daily rebuild produces daily metrics and renders rows',async()=>{
  const day=await page.evaluate(()=>document.getElementById('analytics-end').value);
  assert.equal((await api('/api/v1/admin/reports/rebuild','POST',{day})).status,200);
  assert.ok((await api('/api/v1/admin/reports/daily')).json.items.length>0);
  await page.locator('#analytics-filter button[type=submit]').click();await assertAnalytics();
 });
 await page.goto(origin+'/admin/settings');
 await check('display settings persist with CSRF and expected version',async()=>{
  const before=await api('/api/v1/system/display-settings');const result=await api('/api/v1/system/display-settings','POST',{expected_version:before.json.version,runline_text:'QA synthetic display'});
  assert.equal(result.status,200);assert.equal((await api('/api/v1/system/display-settings')).json.runline_text,'QA synthetic display');
 });
 await check('unconfigured R2 export reports error without fake success',async()=>{
  assert.equal((await api('/api/v1/admin/exports','POST',{format:'csv'})).status,503);
 });
 await check('published card sends plan UUID and stores the confirmed quote on lead',async()=>{
  const before=new Set((await api('/api/v1/admin/leads?limit=100')).json.items.map(lead=>lead.id));
  await page.goto(origin+'/');
  await page.waitForFunction(region=>getSelectedRegionId()===region,regionId);
  await page.locator('.plan-card-actions button[data-plan-id="'+planId+'"]').first().click();
  await page.waitForFunction(()=>typeof activeQuoteToken==='string' && activeQuoteToken.length>0);
  assert.equal(await page.evaluate(()=>selectedPlanId),planId);
  await page.fill('#lead-phone','0916009999');await page.check('#lead-consent');
  const response=page.waitForResponse(r=>r.url()===origin+'/api/v1/leads'&&r.request().method()==='POST');
  await page.click('#btn-submit-lead');const submitted=await response;
  assert.equal(submitted.status(),201);
  const payload=submitted.request().postDataJSON();
  assert.equal(payload.plan_id,planId);assert.equal(payload.region_id,regionId);assert.ok(payload.quote_token);
  const created=(await api('/api/v1/admin/leads?limit=100')).json.items.find(lead=>!before.has(lead.id));assert.ok(created);
  const saved=(await api('/api/v1/admin/leads/'+created.id)).json;
  assert.equal(saved.payload.plan_id,planId);assert.equal(saved.quote.plan_id,planId);
  assert.equal(saved.quote.region_id,regionId);assert.equal(saved.quote.initial_total_vnd,600);
 });
 await check('mobile published packages navigate and filters exclude only other services',async()=>{
  for(let i=0;i<2;i++) {
   const created=(await api('/api/v1/admin/plans','POST',{name:'QA Navigation '+i,service:i===0?'internet':'combo',code:'qa-navigation-'+i})).json;
   assert.equal((await api('/api/v1/admin/plans/'+created.id+'/publish','POST',{expected_version:created.version})).status,200);
  }
  await page.setViewportSize({width:390,height:844});await page.goto(origin+'/');
  await page.waitForFunction(()=>document.querySelectorAll('.plan-card-3d-wrapper').length===3);
  const first=await page.locator('.plan-card-3d-wrapper.is-center button[data-plan-id]').first().getAttribute('data-plan-id');
  await page.evaluate(()=>slidePlansNext());
  const next=await page.locator('.plan-card-3d-wrapper.is-center button[data-plan-id]').first().getAttribute('data-plan-id');
  assert.notEqual(next,first);assert.equal(await page.locator('#plans-slider-dots .plans-dot').count(),3);
  await page.evaluate(()=>filterPlans('combo'));
  assert.equal(await page.locator('.plan-card-3d-wrapper:visible').count(),1);
  assert.equal(await page.locator('.plan-card-3d-wrapper:visible').getAttribute('data-category'),'combo');
  await page.evaluate(()=>filterPlans('all'));assert.equal(await page.locator('#plans-slider-dots .plans-dot').count(),3);
  await page.setViewportSize({width:1440,height:900});
 });
 await check('campaign direct form submits published plan, region and stored quote',async()=>{
  const before=new Set((await api('/api/v1/admin/leads?limit=100')).json.items.map(lead=>lead.id));
  await page.goto(origin+'/khuyen-mai');
  await page.selectOption('#lp-plan',planId);await page.selectOption('#lp-region',regionId);
  await page.fill('#lp-phone','0916009997');await page.check('#lp-consent');
  const response=page.waitForResponse(r=>r.url()===origin+'/api/v1/leads'&&r.request().method()==='POST');
  await page.locator('form[onsubmit="handleDirectLeadSubmit(event)"] button[type="submit"]').click();
  const submitted=await response;assert.equal(submitted.status(),201);
  const payload=submitted.request().postDataJSON();assert.equal(payload.plan_id,planId);assert.equal(payload.region_id,regionId);assert.ok(payload.quote_token);
  const created=(await api('/api/v1/admin/leads?limit=100')).json.items.find(lead=>!before.has(lead.id));assert.ok(created);
  const saved=(await api('/api/v1/admin/leads/'+created.id)).json;
  assert.equal(saved.quote.plan_id,planId);assert.equal(saved.quote.region_id,regionId);assert.equal(saved.quote.initial_total_vnd,600);
  assert.equal(await page.locator('form[onsubmit="handleDirectLeadSubmit(event)"] button[type="submit"]').isDisabled(),false);
 });
 await check('manual retry after lost responses replays the original committed receipt',async()=>{
  await page.goto(origin+'/');
  await page.locator('.plan-card-actions button[data-plan-id="'+planId+'"]').first().click();
  await page.waitForFunction(()=>Boolean(activeQuoteToken));
  await page.fill('#lead-phone','0916009996');await page.check('#lead-consent');
  const requests=[];let committed,lose=true;
  await page.route('**/api/v1/leads',async route=>{
   requests.push({key:route.request().headers()['idempotency-key'],body:route.request().postData()});
   if(lose) {
    if(!committed) {const upstream=await route.fetch();assert.equal(upstream.status(),201);committed=await upstream.json();}
    await route.abort();
   } else await route.continue();
  });
  try {
   await page.click('#btn-submit-lead');await page.waitForFunction(()=>!document.getElementById('btn-submit-lead').disabled);
   assert.equal(requests.length,3);assert.ok(committed);
   await page.evaluate(()=>refreshActiveQuote());lose=false;
   const response=page.waitForResponse(r=>r.url()===origin+'/api/v1/leads'&&r.request().method()==='POST');
   await page.click('#btn-submit-lead');const replayed=await response;
   assert.equal(replayed.status(),200);assert.equal((await replayed.json()).receipt,committed.receipt);
   assert.equal(requests.length,4);assert.equal(new Set(requests.map(item=>item.key)).size,1);assert.equal(new Set(requests.map(item=>item.body)).size,1);
  } finally {await page.unroute('**/api/v1/leads');}
 });
 await check('all client/admin HTML pages load without uncaught JS exceptions',async()=>{
  for(const path of ['/','/khuyen-mai','/san-pham/internet-gia-dinh','/chinh-sach-bao-mat','/admin/dashboard','/admin/leads','/admin/pricing','/admin/reports','/admin/settings']){
   const response=await page.goto(origin+path);assert.equal(response.status(),200);await page.waitForLoadState('domcontentloaded');
  }
  assert.equal(report.page_errors.length,0,JSON.stringify(report.page_errors));
 });
 for(const width of [360,375,390,430,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const path of ['/','/khuyen-mai','/san-pham/internet-gia-dinh','/admin/dashboard','/admin/leads','/admin/pricing','/admin/reports','/admin/settings']){
   await page.goto(origin+path);await page.waitForLoadState('domcontentloaded');
   const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
   report.viewports.push({width,path,...layout,pass:layout.scroll<=layout.viewport+1});
  }
 }
 await check('responsive pages avoid document horizontal overflow',async()=>assert.deepEqual(report.viewports.filter(v=>!v.pass),[]));
 await page.goto(origin+'/admin/dashboard');
 await check('logout clears cookie and private API rejects session',async()=>{
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/session')&&r.request().method()==='DELETE');
  await page.evaluate(()=>{void logoutAdmin();});
  assert.equal((await response).status(),200);await page.waitForURL('**/admin/login');
  assert.equal((await context.cookies()).some(c=>c.name==='pagefpt_admin_session'),false);
  assert.equal((await context.request.get(origin+'/api/v1/admin/me')).status(),401);
 });
 } finally {
  report.passed=report.checks.filter(c=>c.status==='passed').length;report.failed=report.checks.filter(c=>c.status==='failed').length;
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');await browser.close();
  console.log(`Browser integration: ${report.passed} passed, ${report.failed} failed; ${report.viewports.length} responsive checks.`);
  for(const item of report.checks.filter(c=>c.status==='failed'))console.log(item.name+': '+item.error);
  if(report.failed)process.exitCode=1;
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
