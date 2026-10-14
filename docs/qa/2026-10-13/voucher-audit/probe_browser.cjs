/* Explicit local audit. FAIL records are unresolved product defects, not mocks of fixes. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const origin = process.env.PAGEFPT_QA_ORIGIN;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '')) throw Error('Loopback required');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PAGEFPT_CHROME_BINARY, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
  const results = [];
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  async function probe(name, fn) {
    try { await fn(); results.push({ name, status: 'PASS' }); }
    catch (e) { results.push({ name, status: 'FAIL', message: e.message }); }
  }
  try {
    const login = await ctx.request.post(origin + '/api/v1/auth/session', { data: { email: 'qa-admin@example.test', password: 'qa-only-password', otp: '123456' } });
    assert.equal(login.status(), 200);
    const csrf = (await ctx.cookies()).find(c => c.name === 'pagefpt_csrf').value;
    async function api(path, method = 'GET', data) {
      const r = await ctx.request.fetch(origin + path, { method, headers: { 'X-CSRF-Token': csrf }, ...(data ? { data } : {}) });
      const body = await r.json(); assert.ok(r.ok(), JSON.stringify(body)); return body;
    }
    const now = Date.now();
    async function create(code, name) {
      const row = await api('/api/v1/admin/vouchers', 'POST', {
        code, name, terms: 'Synthetic QA only', start: new Date(now - 86400000).toISOString(),
        end: new Date(now + 86400000).toISOString(), quota: 2, budget_vnd: 1000000,
        rules: [{ key: 'default', amount: 100000 }],
      });
      return api('/api/v1/admin/vouchers/' + row.id + '/publish', 'POST', { expected_version: row.version });
    }
    const a = await create('AUDIT-SAFE-A', 'Synthetic offer A');
    const b = await create('AUDIT-SAFE-B', 'Synthetic offer B');
    await api('/api/v1/admin/pages', 'POST', { title: 'QA audit landing', slug: 'audit-landing', blocks: [], template: 'telecom', landing: { hero_title: 'Synthetic landing' } }).then(row => api('/api/v1/admin/pages/' + row.id + '/publish', 'POST', { expected_version: row.version }));

    await probe('Landing exposes manual voucher entry without sharing cookie', async () => {
      await ctx.request.delete(origin + '/api/v1/vouchers/context');
      await page.goto(origin + '/audit-landing');
      await page.waitForFunction(() => !!document.getElementById('client-voucher-banner'));
      await page.waitForResponse(r => r.url().includes('/api/v1/vouchers/context')).catch(() => {});
      const entryVisible = await page.locator('#client-voucher-code').isVisible();
      const toggleVisible = await page.locator('#voucher-marquee-btn').isVisible();
      assert.ok(entryVisible || toggleVisible, 'Manual voucher entry is hidden and landing has no control to open it');
    });

    await probe('Invalid code can be cleared on landing', async () => {
      await api('/api/v1/vouchers/context', 'POST', { code: 'UNKNOWN-AUDIT' });
      // Rendering a failed explicit entry without a marquee must still expose Bỏ mã.
      await page.evaluate(() => { document.getElementById('client-voucher-banner').hidden = false; });
      await page.locator('#client-voucher-code').fill('UNKNOWN-AUDIT');
      const response = page.waitForResponse(r => r.url().endsWith('/vouchers/context') && r.request().method() === 'POST');
      await page.locator('.client-voucher-apply-btn').click();
      await response;
      await page.waitForFunction(() => document.getElementById('client-voucher-message').textContent.includes('không còn'));
      assert.equal(await page.locator('#client-voucher-clear').isVisible(), true);
    });

    await probe('Clear completion does not erase a newer applied code', async () => {
      await api('/api/v1/vouchers/context', 'POST', { code: a.code });
      await page.goto(origin + '/');
      await page.waitForFunction(() => document.getElementById('client-voucher-name')?.textContent === 'Synthetic offer A');
      let releaseDelete;
      const barrier = new Promise(resolve => releaseDelete = resolve);
      let deleteStarted;
      const started = new Promise(resolve => deleteStarted = resolve);
      const handler = async route => {
        if (route.request().method() !== 'DELETE') return route.continue();
        const response = await route.fetch();
        deleteStarted();
        await barrier;
        await route.fulfill({ response });
      };
      await page.route('**/api/v1/vouchers/context', handler);
      await page.locator('#client-voucher-clear').click();
      await started;
      await page.locator('#client-voucher-code').fill(b.code);
      await page.locator('.client-voucher-apply-btn').click();
      // Apply must wait behind the pending DELETE so cookies and visible intent agree.
      await page.waitForTimeout(100);
      releaseDelete();
      await page.waitForFunction(() => document.getElementById('client-voucher-name')?.textContent === 'Synthetic offer B');
      await page.waitForFunction(() => document.getElementById('client-voucher-name')?.textContent !== 'Synthetic offer A');
      await page.waitForTimeout(200);
      await page.unroute('**/api/v1/vouchers/context', handler);
      assert.equal(await page.evaluate(() => window.PageFPTVoucher.quoteContext().voucher_code), b.code);
      const context = await api('/api/v1/vouchers/context');
      assert.equal(context.voucher?.code, b.code, 'Cookie and visible code diverged');
    });

    await probe('Public voucher names cannot execute HTML or JavaScript', async () => {
      const name = '<img src="/audit-missing-image" onerror="window.__voucherAuditXss=1">';
      const xss = await create('AUDIT-XSS', name);
      await api('/api/v1/admin/vouchers/' + xss.id + '/links', 'POST', { slug: 'audit-xss', channel: 'qa' });
      await page.goto(origin + '/s/audit-xss');
      await page.waitForFunction(() => document.getElementById('client-voucher-name')?.textContent.startsWith('<img'));
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__voucherAuditXss), undefined, 'Stored XSS executed through voucher marquee innerHTML');
    });

    await probe('No voucher configured means no invented modem or setup promotion', async () => {
      await ctx.request.delete(origin + '/api/v1/vouchers/context');
      await page.goto(origin + '/');
      await page.waitForFunction(() => !!document.getElementById('client-voucher-banner'));
      const text = await page.locator('#voucher-marquee-text').innerText();
      assert.ok(!/Miễn phí hòa mạng 100%|Tặng Modem Wi-Fi 6/.test(text), 'Unconfigured promotion claims are hardcoded in the marquee');
    });

    await probe('KPI requested tooltip does not count link opens as lead requests', async () => {
      await page.goto(origin + '/admin/vouchers');
      await page.waitForFunction(() => document.querySelectorAll('.voucher-kpi').length === 6);
      const text = await page.locator('.voucher-kpi').first().innerText();
      const tooltip = await page.locator('.voucher-kpi').first().locator('.voucher-kpi-tooltip').textContent();
      assert.ok(!tooltip.includes('mở link'), text + ': ' + tooltip);
    });

    fs.mkdirSync('.local/qa/voucher-audit', { recursive: true });
    fs.writeFileSync('.local/qa/voucher-audit/browser-results.json', JSON.stringify(results, null, 2));
    for (const result of results) console.log(result.status, result.name, result.message || '');
    console.log(`${results.filter(x => x.status === 'PASS').length}/${results.length} browser audit probes passed`);
    if (results.some(x => x.status === 'FAIL')) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
