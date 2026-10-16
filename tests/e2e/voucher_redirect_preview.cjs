const {chromium}=require('playwright'),assert=require('node:assert/strict');
const origin=process.env.PAGEFPT_QA_ORIGIN;
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin||''))throw Error('Loopback fixture required');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext({userAgent:'Zalo',viewport:{width:390,height:844},reducedMotion:'reduce'});
  await ctx.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
  const login=await ctx.request.post(origin+'/api/v1/auth/session',{data:{email:'qa-admin@example.test',password:'qa-only-password',otp:'123456'},headers:{Origin:origin}});assert.equal(login.status(),200);
  const csrf=(await ctx.cookies()).find(c=>c.name==='pagefpt_csrf').value;
  async function api(path,data){const r=await ctx.request.post(origin+path,{data,headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.ok(r.ok(),await r.text());return r.json();}
  const now=Date.now(),slug='qa-zalo-'+now,image='/static/images/device-camera-3d.webp';
  const v=await api('/api/v1/admin/vouchers',{code:'ZALO-'+now,name:'Ưu đãi ảnh riêng',terms:'Theo điều kiện địa bàn.',start:new Date(now-86400000).toISOString(),end:new Date(now+86400000).toISOString(),quota:10,budget_vnd:1000000,rules:[{key:'all',amount:100000}]});
  await api('/api/v1/admin/vouchers/'+v.id+'/publish',{expected_version:v.version});
  await api('/api/v1/admin/vouchers/'+v.id+'/links',{slug,target:'/',preview_image_url:image});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/s/'+slug);
  await page.waitForFunction(()=>document.getElementById('voucher-acquisition')?.open);
  assert.equal(new URL(page.url()).pathname,'/');
  assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'),origin+image);
  assert.equal(await page.locator('meta[name="twitter:image"]').getAttribute('content'),origin+image);
  assert.equal(await page.locator('#voucher-acquisition-code').textContent(),'ZALO-'+now);
  assert.ok((await ctx.cookies()).some(c=>c.name==='pagefpt_voucher'));
  await page.locator('#voucher-acquisition-use').click();await page.locator('#bottom-sheet-backdrop.active').waitFor();
  assert.ok((await page.locator('#form-voucher-summary').textContent()).includes('ZALO-'+now));
  assert.deepEqual(errors,[]);
  console.log('Generic Zalo UA: HTTP redirect, SSR OG/Twitter image, cookie, offer popup and form context passed.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
