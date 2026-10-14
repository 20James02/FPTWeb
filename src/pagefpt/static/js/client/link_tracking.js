/** Link source is service context; journey/timing requires acknowledged analytics consent. */
(function () {
  const storageKey = 'pagefpt_link_journey_v1';
  const preview = (typeof analyticsPreview === 'function' && analyticsPreview()) || document.body?.dataset?.landingPreview === 'true';
  let source = null, sourceAt = null, candidate = null, explicitSource = false, contextReady = false, visit = null, generation = 0, tickTimer, sendTimer, initializing = null;
  let total = 0, acknowledged = 0, sequence = 0, pending = null, sending = null;
  let lastTick = performance.now(), lastActivity = Date.now();
  const pageId = window.crypto.randomUUID();
  const context = () => typeof getAnalyticsContext === 'function' ? getAnalyticsContext() : {};
  const allowed = () => !preview && context().analytics_opt_in === true;
  function clearStore() { try { sessionStorage.removeItem(storageKey); } catch (_) {} }
  function restore() { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch (_) { return null; } }
  function store() { if (allowed() && visit && source) try { sessionStorage.setItem(storageKey, JSON.stringify({source, visit, sourceAt})); } catch (_) {} }
  try {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('pf_link_source');
    if (value && value.length <= 8192) { source = value; explicitSource = true; contextReady = true; }
    if (value) { url.searchParams.delete('pf_link_source'); window.history.replaceState(window.history.state || null, '', url); }
  } catch (_) {}
  async function request(path, body, keepalive = false) {
    return fetch('/api/v1/link-tracking/' + path, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body),
      keepalive, signal: AbortSignal.timeout(4000),
    });
  }
  function account() {
    const now = performance.now();
    const delta = Math.max(0, Math.min(2000, now - lastTick));
    lastTick = now;
    if (visit && allowed() && document.visibilityState === 'visible' && document.hasFocus?.() !== false && Date.now() - lastActivity <= 60000) total += delta;
  }
  function activity() { account(); lastActivity = Date.now(); if (allowed() && !visit) start().catch(()=>{}); }
  function stop() {
    clearInterval(tickTimer); clearInterval(sendTimer);
    tickTimer = sendTimer = null;
  }
  async function start() {
    if (!allowed()) {
      if (!context().session_token && window.PageFPTConsentPreferences?.read?.()?.analytics !== false) return;
      ++generation;
      stop(); const previous = visit || restore()?.visit; visit = null; pending = null; clearStore();
      if (previous) request('revoke', {visit_token:previous}, true).catch(()=>{});
      return;
    }
    if (visit || preview || initializing || !contextReady) return initializing;
    const stored = restore();
    if (!explicitSource) {
      const savedTime = stored?.sourceAt ? Date.parse(stored.sourceAt) : 0;
      const cookieTime = candidate?.source_at ? Date.parse(candidate.source_at) : 0;
      if (typeof stored?.source === 'string' && (!candidate?.source_token || !(cookieTime > savedTime))) { source = stored.source; sourceAt = stored.sourceAt || null; }
      else if (candidate?.source_token) { source = candidate.source_token; sourceAt = candidate.source_at || null; }
    }
    if (!source) return;
    const revision = ++generation;
    initializing = (async()=> { try {
      const response = await request('visit', {source_token:source, session_token:context().session_token,
        ...(stored?.source === source && stored?.visit ? {visit_token:stored.visit}: {})});
      if (!response.ok) { if (response.status < 500) clearStore(); return; }
      const data = await response.json();
      if (!data.visit_token) return;
      if (revision !== generation || !allowed()) {
        request('revoke', {visit_token:data.visit_token}, true).catch(()=>{}); return;
      }
      visit = data.visit_token; sourceAt = data.source_at || sourceAt; total = 0; acknowledged = 0; sequence = 0; pending = null; store();
      lastTick = performance.now(); lastActivity = Date.now();
      tickTimer = setInterval(account, 1000);
      sendTimer = setInterval(()=>flush().catch(()=>{}), 15000);
    } catch (_) { /* Telemetry failure never blocks a lead. */ }
    })();
    try { await initializing; } finally { initializing = null; }
  }
  async function flush(keepalive = false) {
    account();
    if (!allowed() || !visit) return;
    if (sending) return sending;
    if (!pending && Math.floor(total) <= acknowledged) return;
    if (!pending) pending = {visit_token:visit, session_token:context().session_token,
      page_id:pageId, sequence:++sequence, total_ms:Math.floor(total)};
    const packet = pending, revision = generation;
    sending = (async()=> {
      try {
        const response = await request('engagement', packet, keepalive);
        if (revision !== generation) return;
        if (response.ok) { if (pending === packet) { acknowledged = packet.total_ms; pending = null; } }
        else if ([403, 410].includes(response.status)) { stop(); visit = null; pending = null; clearStore(); }
      } catch (_) { /* Retain exact sequence/total for an idempotent retry. */ }
    })();
    try { await sending; } finally { sending = null; }
  }
  // Carry service-only campaign context through internal navigation without
  // storing an identifier or measuring a journey before consent.
  function carrySource(event) {
    if (preview || !source || event.defaultPrevented || (event.type === 'auxclick' && event.button !== 1)) return;
    const anchor = event.target?.closest?.('a[href]');
    const href = anchor?.getAttribute('href');
    if (!href || href.startsWith('#') || anchor.hasAttribute('download')) return;
    try {
      const url = new URL(href, window.location.href), current = new URL(window.location.href);
      if (url.origin !== current.origin || /^(?:\/(?:admin|api|internal|static|r|s)(?:\/|$))/.test(url.pathname)) return;
      if (url.pathname === current.pathname && url.search === current.search) return;
      if (!url.searchParams.has('pf_link_source')) url.searchParams.set('pf_link_source',source);
      anchor.setAttribute('href',url.href);
    } catch (_) {}
  }
  document.addEventListener('click', carrySource);
  document.addEventListener('auxclick', carrySource);
  for (const name of ['pointerdown', 'keydown', 'scroll', 'touchstart']) document.addEventListener(name, activity, {passive:true});
  document.addEventListener('visibilitychange', ()=>{ flush(true).catch(()=>{}); });
  window.addEventListener('pagehide', ()=>{ flush(true).catch(()=>{}); });
  window.addEventListener('pagefpt-consent-change', ()=>{ start().catch(()=>{}); });
  window.PageFPTLinkTracking = {
    leadContext:()=> source && !preview ? {link_source_token:source, ...(visit && allowed() ? {link_visit_token:visit}: {})} : {},
    flush,
  };
  const ready = (async()=> {
    if (preview) return;
    if (!source) try {
      const response = await fetch('/api/v1/link-tracking/context', {signal:AbortSignal.timeout(3000)});
      if (response.ok) { candidate = await response.json(); if (!source && candidate.source_token) { source = candidate.source_token; sourceAt = candidate.source_at || null; } }
    } catch (_) {}
    contextReady = true;
    await start();
  })();
  window.PageFPTLinkTracking.ready = ready;
})();
