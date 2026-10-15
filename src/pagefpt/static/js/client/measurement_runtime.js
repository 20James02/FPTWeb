/* Public, versioned configuration only. Tracking failures never block lead intake. */
(() => {
  if(window.PageFPTMeasurement)return;
  const node=document.getElementById('pagefpt-google-config');
  let initial={};try{initial=JSON.parse(node?.textContent||'{}');}catch{}
  const empty={measurement_id:'',consent_mode:'basic',event_enabled:[],targets:[],versions:[],refresh_seconds:60};
  let active={...empty},timer=null,pending=null;
  const disabled=initial.preview||/^\/admin(?:\/|$)/.test(window.location.pathname);
  const runtime={config:active,refresh,track};
  window.PageFPTMeasurement=runtime;
  const sent=new Set(),pixels=new Set(),googleIds=new Set();
  const context=()=>typeof getAnalyticsContext==='function'?getAnalyticsContext():{};
  const advertising=()=>{const c=context();return c.analytics_opt_in===true&&c.marketing_opt_in===true&&c.advertising_opt_in===true;};
  function google(){
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};
    window.gtag('set',{page_location:window.location.href.split(/[?#]/)[0],page_referrer:(document.referrer||'').split(/[?#]/)[0],allow_ad_personalization_signals:context().personalization_opt_in===true});
    window.gtag('consent','update',{analytics_storage:context().analytics_opt_in?'granted':'denied',ad_storage:advertising()?'granted':'denied',ad_user_data:advertising()?'granted':'denied',ad_personalization:advertising()&&context().personalization_opt_in?'granted':'denied'});
    if(document.head&&!document.querySelector?.('script[data-pagefpt-google-library]')){const script=document.createElement('script');script.async=true;script.dataset.pagefptGoogleLibrary='true';script.src='https://www.googletagmanager.com/gtag/js?id='+runtime.config.targets.find(r=>r.provider==='google_ads')?.settings?.tag_id;document.head.appendChild(script);}
  }
  function meta(){
    if(window.fbq)return;
    const fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments);};
    fbq.queue=[];fbq.push=fbq;fbq.loaded=true;fbq.version='2.0';window.fbq=fbq;window._fbq=window._fbq||fbq;
    if(document.head){const script=document.createElement('script');script.async=true;script.src='https://connect.facebook.net/en_US/fbevents.js';script.referrerPolicy='strict-origin';document.head.appendChild(script);}
  }
  function updateProviders(){
    if(!advertising()){window.fbq?.('consent','revoke');return;}
    for(const target of runtime.config.targets||[]){if(!target.settings?.browser_enabled||target.route!=='browser')continue;
      if(target.provider==='google_ads'&&/^AW-[0-9]{3,30}$/.test(target.settings.tag_id||'')){google();if(!googleIds.has(target.settings.tag_id)){googleIds.add(target.settings.tag_id);window.gtag('config',target.settings.tag_id,{send_page_view:false});}}
      if(target.provider==='meta'&&/^[0-9]{1,30}$/.test(target.settings.pixel_id||'')){meta();window.fbq('consent','grant');if(!pixels.has(target.settings.pixel_id)){pixels.add(target.settings.pixel_id);window.fbq('init',target.settings.pixel_id);}}
    }
  }
  function track(event,data={}){
    if(disabled||!advertising()||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.event_id||''))return false;
    updateProviders();let emitted=false;
    for(const target of runtime.config.targets||[]){if(target.event!==event||target.route!=='browser'||!target.settings?.browser_enabled)continue;
      const key=target.connection_id+':'+event+':'+data.event_id;if(sent.has(key))continue;
      if(target.provider==='google_ads'&&window.gtag&&/^AW-[0-9]{3,30}$/.test(target.settings.tag_id||'')&&/^[a-zA-Z0-9_-]{1,100}$/.test(target.conversion_label||'')){
        window.gtag('event','conversion',{send_to:target.settings.tag_id+'/'+target.conversion_label,transaction_id:data.event_id,value:Math.max(0,Number(target.value_vnd)||0),currency:'VND'});emitted=true;sent.add(key);
      }else if(target.provider==='meta'&&window.fbq&&/^[0-9]{1,30}$/.test(target.settings.pixel_id||'')&&/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(target.provider_event||'')){
        const standard=['Lead','CompleteRegistration','Contact','Purchase','Subscribe'].includes(target.provider_event);
        window.fbq(standard?'trackSingle':'trackSingleCustom',target.settings.pixel_id,target.provider_event,{}, {eventID:data.event_id});emitted=true;sent.add(key);
      }
    }
    if(sent.size>500)sent.delete(sent.values().next().value);return emitted;
  }
  window.addEventListener('pagefpt-consent-change',updateProviders);
  window.addEventListener('pagefpt:lead-accepted',e=>track('lead',e.detail));

  function safe(raw){return {...empty,measurement_id:/^G-[A-Z0-9]{3,30}$/.test(raw.measurement_id||'')?raw.measurement_id:'',consent_mode:raw.consent_mode==='advanced'?'advanced':'basic',event_enabled:Array.isArray(raw.event_enabled)?raw.event_enabled.filter(v=>typeof v==='string'&&/^[a-z_]{1,40}$/.test(v)).slice(0,30):[],targets:Array.isArray(raw.targets)?raw.targets.slice(0,20):[],versions:Array.isArray(raw.versions)?raw.versions.slice(0,4):[],refresh_seconds:Math.max(30,Math.min(300,Number(raw.refresh_seconds)||60)),attribution_window_days:Math.max(1,Math.min(90,Number(raw.attribution_window_days)||30))};}
  async function refresh(){if(disabled)return active;if(pending)return pending;pending=(async()=>{try{const path=/^\/[a-z0-9/-]{0,149}$/.test(window.location.pathname)?window.location.pathname:'/';const response=await fetch('/api/v1/measurement/config?'+new URLSearchParams({path}),{credentials:'same-origin',signal:AbortSignal.timeout(5000),cache:'no-cache'});if(!response.ok)return active;const next=safe(await response.json());active=next;runtime.config=active;if(node)node.textContent=JSON.stringify({...active,dynamic:true,preview:false});window.dispatchEvent(new CustomEvent('pagefpt-measurement-config',{detail:active}));updateProviders();}catch{}finally{pending=null;clearTimeout(timer);timer=setTimeout(()=>{if(document.visibilityState==='visible')refresh();},active.refresh_seconds*1000);}return active;})();return pending;}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  runtime.ready=disabled?Promise.resolve(active):refresh();
})();
