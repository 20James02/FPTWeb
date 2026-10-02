// Isolated diagnostics against the disposable fixture; never run against cloud data.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.PAGEFPT_QA_ORIGIN || 'http://127.0.0.1:8092';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Disposable loopback fixture required');
const output = process.env.PAGEFPT_QA_DIAGNOSTICS || 'docs/qa/2026-10-01/diagnostics.json';
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(10000);
  const report = {environment:'Disposable loopback PostgreSQL and synthetic Auth only',checks:[],layouts:[]};
  await page.route('**/*', r => r.request().url().startsWith(origin+'/') ? r.continue() : r.abort());
  async function check(name, fn) {
    try { await fn(); report.checks.push({name,status:'passed'}); }
    catch (e) { report.checks.push({name,status:'failed',error:e.message.slice(0,500)}); }
    console.log(report.checks.at(-1).status+': '+name);
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  }
  async function api(path, method='GET', body) {
    return page.evaluate(async ({path,method,body}) => {
      const csrf=document.cookie.split('; ').find(c=>c.startsWith('pagefpt_csrf='));
      const headers={'Content-Type':'application/json'};
      if(csrf) headers['X-CSRF-Token']=decodeURIComponent(csrf.slice(13));
      const r=await fetch(path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
      return {status:r.status,data:await r.json()};
    },{path,method,body});
  }
  try {
    console.log('Opening synthetic fixture login');
    await page.goto(origin+'/admin/login');
    console.log('Authenticating synthetic fixture');
    assert.equal((await api('/api/v1/auth/session','POST',{email:'qa-admin@example.test',password:'qa-only-password',otp:'123456'})).status,200);
    await page.goto(origin+'/admin/pricing');
    console.log('Waiting for pricing catalog');
    await page.waitForFunction(()=>availablePlans.length>0);
    await check('price UI submit creates a persisted draft',async()=>{
      const before=await api('/api/v1/admin/prices');
      const knownIds=new Set(before.data.items.map(p=>p.id));
      await page.evaluate(()=>openCreatePriceModal());
      const plan=await page.evaluate(()=>availablePlans.find(p=>p.payload?.code==='qa-synthetic').id);
      await page.selectOption('#inp-plan-id',plan);
      await page.fill('#inp-monthly-vnd','101');
      await page.fill('#inp-source','qa-synthetic-diagnostic');
      report.price_form_valid=await page.evaluate(()=>document.getElementById('create-price-form').checkValidity());
      assert.equal(report.price_form_valid,true);
      const responsePromise=page.waitForResponse(r=>r.url()===origin+'/api/v1/admin/prices'&&r.request().method()==='POST',{timeout:8000});
      const [response]=await Promise.all([responsePromise,page.click('#btn-submit-price')]);
      report.price_submit_status=response.status();
      assert.equal(response.status(),201);
      const after=await api('/api/v1/admin/prices');
      const created=after.data.items.find(p=>!knownIds.has(p.id)&&p.monthly_vnd===101);
      assert.ok(created,'UI-created price must be visible through the read API');
      const persisted=await api('/api/v1/admin/prices/'+created.id);
      assert.equal(persisted.status,200);
      assert.equal(persisted.data.status,'draft');
      assert.equal(persisted.data.monthly_vnd,101);
      report.price_draft_persisted=true;
    });
    await check('pricing renderer treats stored plan names as text',async()=>{
      // Harmless marker: no external resource, credentials or data extraction.
      const plan=await api('/api/v1/admin/plans','POST',{name:'<img src="/qa-missing-image" onerror="window.__qaStoredHtml=1">',service:'internet',code:'qa-html-'+Date.now()});
      assert.equal(plan.status,201);
      const price=await api('/api/v1/admin/prices','POST',{plan_id:plan.data.id,scope_id:'00000000-0000-0000-0000-000000000000',scope_kind:'default',billing_months:6,monthly_vnd:1,start:new Date().toISOString(),source:'qa-synthetic'});
      assert.equal(price.status,201);
      await page.evaluate(async()=>{window.__qaStoredHtml=0;await loadPricesList();});
      // LoadPricesList inserts the img; wait for its error handler, if present.
      await page.waitForFunction(()=>window.__qaStoredHtml===1,{},{timeout:1000}).catch(()=>{});
      report.stored_html_executed=await page.evaluate(()=>window.__qaStoredHtml===1);
      assert.equal(report.stored_html_executed,false,'Stored plan name executed an inline event handler');
    });
    await page.goto(origin+'/');
    await check('public package selection carries backend plan UUID',async()=>{
      const button=page.locator('.plan-card-actions button[data-plan-id]:visible').first();
      report.public_plan_onclick=await button.getAttribute('onclick');
      await button.click();
      report.selected_plan_id=await page.evaluate(()=>selectedPlanId);
      assert.match(report.selected_plan_id || '',/^[0-9a-f-]{36}$/,'A package selection must identify a backend plan');
    });
    await page.goto(origin+'/admin/settings');
    await check('settings save handler persists UI values',async()=>{
      await page.fill('#setting-runline-text','QA synthetic settings handler');
      await page.evaluate(()=>saveAdminDisplaySettings());
      assert.equal((await api('/api/v1/system/display-settings')).data.runline_text,'QA synthetic settings handler');
    });
    await check('client runline renders stored settings as text',async()=>{
      const before=await api('/api/v1/system/display-settings');
      const marker='<img src="/qa-missing-image" onerror="window.__qaRunlineHtml=1">';
      assert.equal((await api('/api/v1/system/display-settings','POST',{expected_version:before.data.version,runline_text:marker})).status,200);
      await page.goto(origin+'/');
      await page.waitForFunction(()=>document.getElementById('runline-marquee-text').textContent.includes('__qaRunlineHtml'));
      assert.equal(await page.evaluate(()=>Boolean(window.__qaRunlineHtml)),false);
      assert.equal(await page.locator('#runline-marquee-text img').count(),0);
    });
    await page.goto(origin+'/admin/login');
    await check('password recovery sends a server request before claiming completion',async()=>{
      const requests=[];
      const listener=r=>{if(r.url().startsWith(origin+'/api/')&&r.method()==='POST')requests.push(new URL(r.url()).pathname);};
      page.on('request',listener);
      await page.evaluate(async()=>{
        switchLoginMode('forgot');
        document.getElementById('forgot-account').value='qa-reset@example.test';
        await handleForgotStep1();
        document.getElementById('forgot-otp-code').value='111111';
        handleForgotStep2();
        document.getElementById('new-password').value='QA-Reset-Only-12345';
        document.getElementById('confirm-new-password').value='QA-Reset-Only-12345';
        await handleForgotStep3();
      });
      page.off('request',listener);
      report.password_recovery_post_paths=requests;
      assert.deepEqual(requests,['/api/v1/auth/recovery','/api/v1/auth/recovery/reset']);
      assert.equal(await page.locator('#new-password').inputValue(),'QA-Reset-Only-12345','Invalid code must not switch to successful login');
      assert.equal(await page.locator('#btn-forgot-step3-submit').isDisabled(),false);

    });
    await check('email and MFA recovery changes password, clears credentials and revokes session',async()=>{
      const response=page.waitForResponse(r=>r.url()===origin+'/api/v1/auth/recovery/reset'&&r.request().method()==='POST');
      await page.evaluate(async()=>{
        document.getElementById('forgot-otp-code').value='654321';
        document.getElementById('recovery-totp').value='123456';
        await handleForgotStep3();
      });
      const changed=await response;assert.equal(changed.status(),200);assert.equal((await changed.json()).changed,true);
      for (const id of ['new-password','confirm-new-password','forgot-otp-code','recovery-totp','login-password']) assert.equal(await page.locator('#'+id).inputValue(),'');
      assert.equal((await api('/api/v1/admin/me')).status,401);
      // Provider HTTP is synthetic; credential persistence is verified at the PUT boundary in pytest.
      assert.equal((await api('/api/v1/auth/session','POST',{email:'qa-admin@example.test',password:'qa-only-password',otp:'123456'})).status,200);
    });
    for (const [width,path,label] of [[390,'/','home-mobile'],[360,'/admin/dashboard','dashboard-mobile'],[390,'/admin/settings','settings-mobile']]) {
      await page.setViewportSize({width,height:900});
      await page.goto(origin+path);
      const layout=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&r.left>=0;}).slice(0,12).map(e=>({tag:e.tagName,id:e.id,classes:e.className?.toString().slice(0,120),width:Math.round(e.getBoundingClientRect().width),right:Math.round(e.getBoundingClientRect().right)}))}));
      report.layouts.push({path,...layout});
      await page.screenshot({path:require('node:path').join(require('node:path').dirname(output),label+'.png')});
    }
  } finally {
    report.passed=report.checks.filter(c=>c.status==='passed').length;
    report.failed=report.checks.filter(c=>c.status==='failed').length;
    fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
    await browser.close();
    if(report.failed) process.exitCode=1;
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
