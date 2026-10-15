/**
 * PAGEFPT ANALYTICS & INTERACTIVE UI HELPERS
 * Lightweight event tracking (batching) & dynamic UI interactions
 * Zero fake pricing maps; strict whitelist tracking
 */

const eventQueue = [];
let flushTimeout = null;
let analyticsContext = {
  analytics_opt_in: false,
  marketing_opt_in: false,
  advertising_opt_in: false,
  personalization_opt_in: false,
  session_token: null,
  attribution_token: null,
};

const eventNames = new Set([
  "view_plan",
  "select_plan",
  "select_region",
  "compare_plans",
  "start_form",
  "view_cost",
  "click_call",
  "click_zalo",
  "return_visit",
  "experiment_exposure",
  "view_landing",
]);

/**
 * Initialize client session with backend (default analytics=false, marketing=false)
 */
let sessionInitialization = null;
let consentRevision = 0;
function analyticsPreview() {
  try {
    return (
      JSON.parse(
        document.getElementById("pagefpt-google-config")?.textContent || "{}",
      ).preview === true || document.body?.dataset?.landingPreview === "true"
    );
  } catch (_) {
    return true;
  }
}
const sessionStorageKey='pagefpt_analytics_session_v1';
const pendingRevokeKey='pagefpt_pending_revocations_v1';
function pendingRevocations(){try{return (JSON.parse(window.localStorage?.getItem(pendingRevokeKey)||'[]')).filter(v=>typeof v.token==='string'&&v.token.length<=8192&&Number.isFinite(v.expiresAt)&&v.expiresAt>Date.now()&&v.expiresAt<=Date.now()+90*86400000).slice(0,8);}catch{return [];}}
function storeRevocations(rows){try{if(rows.length)window.localStorage?.setItem(pendingRevokeKey,JSON.stringify(rows));else window.localStorage?.removeItem(pendingRevokeKey);}catch{}}
function queueRevocation(token){if(!token)return;const rows=pendingRevocations();if(!rows.some(v=>v.token===token))rows.push({token,expiresAt:Date.now()+90*86400000});storeRevocations(rows.slice(-8));}
function acknowledgeRevocation(token){storeRevocations(pendingRevocations().filter(v=>v.token!==token));}
async function flushPendingRevocations(){for(const entry of pendingRevocations()){try{const response=await fetch('/api/v1/consent/revoke',{signal:AbortSignal.timeout(3000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:entry.token})});if(!response.ok)return false;acknowledgeRevocation(entry.token);}catch{return false;}}return true;}

function saveAnalyticsSession(){try{if(analyticsContext.analytics_opt_in&&analyticsContext.session_token){window.localStorage?.setItem(sessionStorageKey,JSON.stringify({token:analyticsContext.session_token,expiresAt:Date.now()+30*86400000}));}else window.localStorage?.removeItem(sessionStorageKey);}catch{}}
function savedAnalyticsSession(){try{const value=JSON.parse(window.localStorage?.getItem(sessionStorageKey)||'null');if(value&&typeof value.token==='string'&&value.token.length<=8192&&Number.isFinite(value.expiresAt)&&value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+30*86400000)return value.token;}catch{}return null;}
async function initClientSession(restoreChoice = true) {
  if (analyticsPreview()) return null;
  if (analyticsContext.session_token) return analyticsContext.session_token;
  if (sessionInitialization) return sessionInitialization;
  sessionInitialization = (async () => {
    const revision = consentRevision;
    const choice = restoreChoice
      ? window.PageFPTConsentPreferences?.read()
      : null;
    try {
      if(pendingRevocations().length && !await flushPendingRevocations())return null;
      const saved=choice?.analytics===true?savedAnalyticsSession():null;
      if(saved){
        const resumed=await fetch('/api/v1/sessions/resume',{signal:AbortSignal.timeout(3000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:saved})});
        if(resumed.ok){
          const allowed=await resumed.json();
          analyticsContext.session_token=saved;
          if(revision===consentRevision){
            for(const key of ['analytics','marketing','advertising','personalization'])analyticsContext[key+'_opt_in']=choice[key]===true&&allowed[key]===true;
            // A saved local restriction must reach the server before this session is used.
            if(['analytics','marketing','advertising','personalization'].some(k=>allowed[k]===true&&!analyticsContext[k+'_opt_in'])){
              const synced=await fetch('/api/v1/consent',{signal:AbortSignal.timeout(3000),method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_token:saved,analytics:analyticsContext.analytics_opt_in,marketing:analyticsContext.marketing_opt_in,advertising:analyticsContext.advertising_opt_in,personalization:analyticsContext.personalization_opt_in,consent_version:'2026-10-v3'})});
              if(!synced.ok){analyticsContext.analytics_opt_in=false;analyticsContext.marketing_opt_in=false;analyticsContext.advertising_opt_in=false;analyticsContext.personalization_opt_in=false;}
            }
          }
          saveAnalyticsSession();window.dispatchEvent(new CustomEvent('pagefpt-consent-change'));
          if(analyticsContext.analytics_opt_in)await initAttribution();
          return analyticsContext.session_token;
        }
        window.localStorage?.removeItem(sessionStorageKey);
      }
      const res = await fetch("/api/v1/sessions", {
        signal: AbortSignal.timeout(3000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analytics: choice?.analytics === true,
          marketing: choice?.marketing === true,
          advertising: choice?.advertising === true,
          personalization: choice?.personalization === true,
          consent_version: "2026-10-v3",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session_token) {
          analyticsContext.session_token = data.session_token;
          if (revision === consentRevision) {
            analyticsContext.analytics_opt_in = choice?.analytics === true;
            analyticsContext.marketing_opt_in = choice?.marketing === true;
            analyticsContext.advertising_opt_in = choice?.advertising === true;
            analyticsContext.personalization_opt_in = choice?.personalization === true;
          }
          saveAnalyticsSession();
          window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
          if (analyticsContext.analytics_opt_in) await initAttribution();
        }
      }
    } catch (_) {
      /* Form use remains available during a session network failure. */
    }
    return analyticsContext.session_token;
  })();
  try {
    return await sessionInitialization;
  } finally {
    sessionInitialization = null;
  }
}

// Call only after an explicit user choice in the consent interface.
async function setAnalyticsConsent(analytics, marketing = false, advertising = false, personalization = false) {
  if (analyticsPreview()) throw new Error("Bản xem trước không bật đo lường.");
  advertising = Boolean(advertising && analytics && marketing);
  personalization = Boolean(personalization && advertising);
  consentRevision += 1;
  if(!analytics||!marketing||!advertising||!personalization)queueRevocation(analyticsContext.session_token);
  if(analyticsContext.advertising_opt_in&&!advertising)window.PageFPTConsentPreferences?.write(analyticsContext.analytics_opt_in,analyticsContext.marketing_opt_in,false,false);
  analyticsContext.advertising_opt_in &&= advertising;
  analyticsContext.personalization_opt_in &&= personalization;
  window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
  // Restrict immediately, even offline. Permission increases still require an acknowledgement.
  if (!analytics || (!marketing && analyticsContext.marketing_opt_in)) {
    analyticsContext.analytics_opt_in &&= Boolean(analytics);
    analyticsContext.marketing_opt_in &&= Boolean(marketing);
    analyticsContext.attribution_token = null;
    if (!analytics){eventQueue.length = 0;saveAnalyticsSession();}
    window.PageFPTConsentPreferences?.write(
      analyticsContext.analytics_opt_in,
      analyticsContext.marketing_opt_in,
    );
    window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
  }
  await initClientSession(false);
  const previous = analyticsContext.session_token;
  if(previous&&(!analytics||!marketing||!advertising||!personalization))queueRevocation(previous);
  const path = previous ? "/api/v1/consent" : "/api/v1/sessions";
  const response = await fetch(path, {
    signal: AbortSignal.timeout(5000),
    method: previous ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      analytics: Boolean(analytics),
      marketing: Boolean(marketing),
      advertising,
      personalization,
      consent_version: "2026-10-v3",
      ...(previous ? { session_token: previous } : {}),
    }),
  });
  if (!response.ok) throw new Error("Chưa lưu được lựa chọn dữ liệu.");
  const data = await response.json();
  if (!(previous || data.session_token))
    throw new Error("Chưa xác nhận được phiên dữ liệu.");
  if(previous)acknowledgeRevocation(previous);
  analyticsContext = {
    analytics_opt_in: Boolean(analytics),
    marketing_opt_in: Boolean(marketing),
    advertising_opt_in: advertising,
    personalization_opt_in: personalization,
    session_token: previous || data.session_token,
    attribution_token: null,
  };
  saveAnalyticsSession();
  window.PageFPTConsentPreferences?.write(
    Boolean(analytics),
    Boolean(marketing),
    advertising,
    personalization,
  );
  window.dispatchEvent(new CustomEvent("pagefpt-consent-change"));
  if (!analytics) {
    eventQueue.length = 0;
    return;
  }
  try {
    await initAttribution();
  } catch (_) {}
}

async function initAttribution() {
  const params = new URLSearchParams(window.location.search);
  const attributes = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    const value = params.get(key) || "";
    if (/^[a-zA-Z0-9_.-]{0,100}$/.test(value)) attributes[key] = value;
  }
  if (analyticsContext.advertising_opt_in) {
    const cookies=Object.fromEntries((document.cookie||'').split(';').map(v=>{const pos=v.indexOf('=');return pos<0?['','']:[v.slice(0,pos).trim(),v.slice(pos+1)];}));
    const ga=/^GA[0-9]+\.[0-9]+\.([0-9]{1,20}\.[0-9]{1,20})$/.exec(cookies._ga||'');
    if(ga)attributes.ga_client_id=ga[1];
    for(const [cookie,key] of [['_fbp','fbp'],['_fbc','fbc']])if(/^fb\.[0-9]+\.[0-9]{10,16}\.[a-zA-Z0-9_-]{1,256}$/.test(cookies[cookie]||''))attributes[key]=cookies[cookie];
  }
  const actualFbclid=params.get("fbclid");if(actualFbclid&&attributes.fbc&&!attributes.fbc.endsWith("."+actualFbclid))delete attributes.fbc;
  if (analyticsContext.marketing_opt_in) {
    for (const key of ["campaign_id", "adgroup_id", "adset_id", "ad_id"]) {
      const value = params.get(key) || (key === "campaign_id" ? params.get("utm_id") : "") || "";
      if (/^[0-9]{1,40}$/.test(value)) attributes[key] = value;
    }
    for (const [key,platform] of [["gclid","google"],["gbraid","google"],["wbraid","google"],["fbclid","meta"]]) {
      const value=params.get(key);
      if (/^[a-zA-Z0-9_-]{1,256}$/.test(value||"")) { attributes.platform=platform; attributes.click_id_type=key; attributes.click_id=value; break; }
    }
  }
  if (/^\/[a-z0-9/-]{0,149}$/.test(window.location.pathname)) attributes.landing_path=window.location.pathname;
  const touch = await fetch("/api/v1/touches", {
    signal: AbortSignal.timeout(3000),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_token: analyticsContext.session_token,
      ...attributes,
    }),
  });
  if (touch.ok){
    analyticsContext.attribution_token = (await touch.json()).attribution_token;
    window.dispatchEvent(new CustomEvent("pagefpt-attribution-ready"));
  }
}

function getAnalyticsContext() {
  return { ...analyticsContext };
}

function trackEvent(name, data = {}) {
  if (
    !analyticsContext.analytics_opt_in ||
    !eventNames.has(name) ||
    eventQueue.length >= 100
  )
    return;
  const event = { id: generateUUID(), name };
  if (
    name === "view_landing" &&
    /^[a-z0-9-]{1,100}$/.test(data.landing_slug || "")
  )
    event.landing_slug = data.landing_slug;
  for (const key of ["plan_id", "region_id", "experiment_id"]) {
    if (typeof data[key] === "string" && /^[0-9a-f-]{36}$/i.test(data[key]))
      event[key] = data[key];
  }
  if (
    typeof data.variant === "string" &&
    /^[a-z0-9_-]{1,50}$/.test(data.variant)
  )
    event.variant = data.variant;
  if (Number.isInteger(data.experiment_version) && data.experiment_version > 0)
    event.experiment_version = data.experiment_version;
  eventQueue.push(event);
  window.PageFPTGoogle?.track(name, event);
  if (!flushTimeout) flushTimeout = setTimeout(flushEvents, 3000);
}

async function flushEvents() {
  flushTimeout = null;
  if (!analyticsContext.analytics_opt_in || eventQueue.length === 0) return;
  const batch = eventQueue.splice(0, 20);
  try {
    const response = await fetch("/api/v1/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_token: analyticsContext.session_token,
        events: batch,
      }),
    });
    if (response.status === 503) eventQueue.unshift(...batch);
  } catch (_) {
    eventQueue.unshift(...batch);
  }
  if (eventQueue.length) flushTimeout = setTimeout(flushEvents, 5000);
}

// Plan Segment Filter
function filterPlans(category, tabBtn) {
  document
    .querySelectorAll(".segment-tab-btn")
    .forEach((b) => b.classList.remove("active"));
  if (tabBtn) tabBtn.classList.add("active");

  const cards = document.querySelectorAll(".plan-card-3d-wrapper, .plan-card");
  cards.forEach((card) => {
    if (category === "all" || card.getAttribute("data-category") === category) {
      card.dataset.categoryHidden = "false";
      card.style.display = "flex";
    } else {
      card.dataset.categoryHidden = "true";
      card.style.display = "none";
    }
  });

  if (typeof updatePlans3DMode === "function") {
    updatePlans3DMode();
  }

  trackEvent("view_plan", { category });
}

// FAQ Accordion Toggle
function toggleFaq(button) {
  const item = button.closest(".faq-item");
  if (!item) return;

  const isOpen = item.classList.contains("open");

  // Close other open faqs
  document
    .querySelectorAll(".faq-item")
    .forEach((i) => i.classList.remove("open"));

  if (!isOpen) {
    item.classList.add("open");
  }
}

window.addEventListener("pagehide", () => {
  if (
    analyticsContext.analytics_opt_in &&
    eventQueue.length &&
    navigator.sendBeacon
  ) {
    navigator.sendBeacon(
      "/api/v1/events/batch",
      new Blob(
        [
          JSON.stringify({
            session_token: analyticsContext.session_token,
            events: eventQueue.slice(0, 20),
          }),
        ],
        { type: "application/json" },
      ),
    );
  }
});

window.addEventListener('online',()=>flushPendingRevocations());

// Cross-tab changes can restrict immediately; permission increases still need server acknowledgement.
window.addEventListener('storage',event=>{
  if(event.key!=='pagefpt-data-choice')return;
  const choice=window.PageFPTConsentPreferences?.read();
  consentRevision+=1;
  for(const key of ['analytics','marketing','advertising','personalization'])analyticsContext[key+'_opt_in']&&=choice?.[key]===true;
  analyticsContext.advertising_opt_in&&=analyticsContext.analytics_opt_in&&analyticsContext.marketing_opt_in;
  analyticsContext.personalization_opt_in&&=analyticsContext.advertising_opt_in;
  if(!analyticsContext.analytics_opt_in){eventQueue.length=0;analyticsContext.attribution_token=null;saveAnalyticsSession();}
  window.dispatchEvent(new CustomEvent('pagefpt-consent-change'));
});

// Auto-bootstrap session on page load
document.addEventListener("DOMContentLoaded", () => {
  initClientSession();
});
