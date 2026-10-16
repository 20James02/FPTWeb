const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const origin=process.env.PAGEFPT_QA_ORIGIN||'http://127.0.0.1:8097';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))throw Error('Loopback fixture only');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  const login=await page.request.post(origin+'/api/v1/auth/session',{data:{email:'qa-admin@example.test',password:'qa-only-password',otp:'123456'},headers:{Origin:origin}});assert.equal(login.status(),200);
  const csrf=(await page.context().cookies()).find(c=>c.name==='pagefpt_csrf').value;
  const create=async(provider,name,settings)=>{const r=await page.request.post(origin+'/api/v1/admin/measurement/connections',{data:{name,provider,environment:'test',enabled:true,settings},headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(r.status(),201,await r.text());return r.json();};
  const ga=await create('ga4','Wizard GA4',{measurement_id:'G-WIZARD123',browser_enabled:true}),meta=await create('meta','Wizard Meta',{pixel_id:'234567',browser_enabled:true,server_enabled:true});
  await page.goto(origin+'/admin/measurement');await page.locator('#ms-connections').getByText('Wizard GA4',{exact:true}).first().waitFor();
  await page.click('[data-ms-tab=configs]');await page.click('#ms-new-config');const form=page.locator('#ms-config-form');
  await form.locator('[data-ms-next]').click();assert.ok(await form.locator('[data-ms-step-panel="0"]').isVisible(),'Cannot skip required name');
  const landing='/wizardqa-'+Date.now();
  await form.locator('[name=name]').fill('Wizard website');await form.locator('[name=environment]').selectOption('test');await form.locator('[name=scope]').selectOption('landing');await form.locator('[name=scope_key]').fill(landing);await form.locator('[data-ms-next]').click();
  await form.locator('[name=ga4_connection_id]').selectOption(ga.id);await form.locator('[name=ga4_enabled]').selectOption('true');
  await page.click('#ms-check-selected');await page.locator('#ms-config-diagnostics').getByText('Chưa có Access Token để kiểm tra API.',{exact:true}).waitFor();
  assert.ok((await page.locator('#ms-config-diagnostics').innerText()).includes('chưa xác minh sự kiện nhận'));
  await form.locator('[data-ms-next]').click();await page.click('#ms-map-ga4');assert.equal(await page.locator('#ms-rules > .ms-rule').count(),17);await page.click('#ms-map-ga4');assert.equal(await page.locator('#ms-rules > .ms-rule').count(),17,'Preset is idempotent');
  await page.click('#ms-add-rule');let rule=page.locator('#ms-rules > .ms-rule').last();await rule.locator('[name=event]').selectOption('click_zalo');await rule.locator('[name=connection_id]').selectOption(meta.id);assert.equal(await rule.locator('[name=provider_event]').inputValue(),'Contact');assert.ok(await rule.locator('[name=primary]').isDisabled());assert.ok(await rule.locator('[name=value_vnd]').isDisabled());
  await page.click('#ms-add-rule');rule=page.locator('#ms-rules > .ms-rule').last();await rule.locator('[name=event]').selectOption('closed');await rule.locator('[name=connection_id]').selectOption(meta.id);assert.equal(await rule.locator('[name=route]').inputValue(),'server');
  await page.click('#ms-add-rule');await form.locator('[name=override_rules]').uncheck();assert.ok(await page.locator('#ms-rules').isHidden());await form.locator('[data-ms-next]').click();assert.ok(await form.locator('[data-ms-step-panel="3"]').isVisible(),'Inherited hidden invalid rules must not block navigation');await form.locator('[data-ms-prev]').click();await form.locator('[name=override_rules]').check();await page.locator('#ms-rules > .ms-rule').last().getByRole('button',{name:'Bỏ liên kết',exact:true}).click();assert.equal(await page.locator('#ms-rules > .ms-rule').count(),19);
  for(const width of [360,390,430,768,1440])for(const theme of ['light','dark']){
   await page.setViewportSize({width,height:1000});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   assert.ok(await page.locator('#ms-config-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),width+' '+theme);
   if([390,1440].includes(width))await page.screenshot({path:'.local/qa/measurement-wizard-20261016/wizard-'+width+'-'+theme+'.png'});
  }
  await form.locator('[data-ms-next]').click();assert.ok((await form.locator('[data-ms-summary]').innerText()).includes('19 sự kiện/đích riêng'));
  const saving=page.waitForResponse(r=>r.url().endsWith('/api/v1/admin/measurement/configs')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Lưu & mô phỏng',exact:true}).click();const saved=await saving;assert.equal(saved.status(),201,await saved.text());await page.locator('#ms-preview-dialog').waitFor();assert.ok(await page.locator('#ms-publish').isDisabled());
  const simulate=page.locator('#ms-simulate-form');await simulate.locator('[name=event]').selectOption('click_zalo');for(const key of ['analytics','marketing','advertising'])await simulate.locator('[name='+key+']').check();
  await simulate.getByRole('button',{name:'Mô phỏng',exact:true}).click();await page.locator('#ms-publish:not([disabled])').waitFor();assert.ok((await page.locator('#ms-simulation').innerText()).includes('Contact'));
  await simulate.locator('[name=path]').fill('/camera');assert.ok(await page.locator('#ms-publish').isDisabled(),'Changed inputs invalidate simulation');await simulate.getByRole('button',{name:'Mô phỏng',exact:true}).click();await page.locator('#ms-publish:not([disabled])').waitFor();await page.click('#ms-publish');await page.locator('#ms-preview-dialog').waitFor({state:'hidden'});
  const publicConfig=await page.request.get(origin+'/api/v1/measurement/config?path='+encodeURIComponent(landing));assert.equal(publicConfig.status(),200);const data=await publicConfig.json();assert.equal(data.measurement_id,'G-WIZARD123');assert.equal(data.targets.length,19);
  assert.deepEqual(errors,[]);console.log('Wizard browser passed: required-step validation, real diagnostic warnings, all GA4 event preset/idempotency, Meta behavior and CRM links, simulation gate, 19 published targets, five widths/two themes.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
