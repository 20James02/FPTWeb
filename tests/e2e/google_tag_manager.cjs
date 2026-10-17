const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || '')) throw Error('Loopback fixture required');

(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    const tags = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith(origin + '/')) return route.continue();
      if (url === 'https://www.googletagmanager.com/gtm.js?id=GTM-55F7ZTBZ') {
        tags.push(url);
        return route.fulfill({contentType:'application/javascript',body:`window.__gtmConsentSnapshot = window.dataLayer.map(x => Array.isArray(x) ? x : x[0] ? Array.from(x) : x);`});
      }
      if (url.includes('googletagmanager.com/gtag/js')) return route.fulfill({contentType:'application/javascript',body:'/* Fixture: external analytics transport disabled. */'});
      return route.abort();
    });
    for (const path of ['/', '/do-toc-do', '/san-pham/internet-gia-dinh', '/chinh-sach-bao-mat']) {
      const before = tags.length;
      await page.goto(origin + path);
      await page.waitForFunction(() => !!window.__gtmConsentSnapshot && !!window.PageFPTGoogle);
      assert.equal(tags.length, before + 1, 'One GTM request per client document');
      const snapshot = await page.evaluate(() => window.__gtmConsentSnapshot);
      const consent = snapshot.findIndex(x => x[0] === 'consent' && x[1] === 'default');
      const start = snapshot.findIndex(x => x.event === 'gtm.js');
      assert.ok(consent >= 0 && consent < start);
      assert.equal(snapshot[consent][2].analytics_storage, 'denied');
      assert.equal(snapshot[consent][2].ad_storage, 'denied');
      const pageViews = await page.evaluate(() => window.dataLayer.filter(x => x[0] === 'event' && x[1] === 'page_view').length);
      assert.equal(pageViews, 1, 'Existing GA4 emits one page view');
    }
    await page.goto(origin + '/');
    await page.waitForFunction(() => typeof getAnalyticsContext === 'function' && !!getAnalyticsContext().session_token);
    await page.locator('[data-consent-choice="accept"]').click();
    await page.waitForFunction(() => getAnalyticsContext().analytics_opt_in);
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x=>x[0]==='consent'&&x[1]==='update').at(-1)[2].analytics_storage), 'granted');
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x=>x[0]==='event'&&x[1]==='page_view').length), 1);
    await page.locator('[data-open-consent]').first().click();
    await page.locator('#consent-analytics').uncheck();
    await page.locator('#data-consent-form [type=submit]').click();
    await page.waitForFunction(() => !getAnalyticsContext().analytics_opt_in);
    assert.equal(await page.evaluate(() => window.dataLayer.filter(x=>x[0]==='consent'&&x[1]==='update').at(-1)[2].analytics_storage), 'denied');
    const beforeAdmin = tags.length;
    await page.goto(origin + '/admin/login');
    assert.equal(tags.length, beforeAdmin);
    assert.equal(await page.locator('iframe[title="Google Tag Manager"]').count(), 0);
    const nojs = await browser.newContext({javaScriptEnabled:false});
    const staticPage = await nojs.newPage(); let fallback = false;
    await staticPage.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/')) return route.continue();
      if (route.request().url() === 'https://www.googletagmanager.com/ns.html?id=GTM-55F7ZTBZ') fallback = true;
      return route.fulfill({status:200,body:''});
    });
    await staticPage.goto(origin + '/');
    assert.equal(await staticPage.locator('body > noscript iframe').count(), 1);
    assert.ok(fallback, 'Noscript fallback requested when JavaScript disabled');
    assert.deepEqual(errors, []);
    console.log('GTM browser passed: four public routes, one container per document, denied defaults before GTM, accept/revoke updates, no duplicated native GA4 page views, Admin excluded, JavaScript-disabled fallback. External measurement transport blocked.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
