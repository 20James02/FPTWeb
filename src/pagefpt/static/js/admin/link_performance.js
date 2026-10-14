/** Server-owned source/cohort totals. All dynamic content uses text nodes. */
(function () {
  const $ = id => document.getElementById(id);
  const platforms = [['facebook','Facebook'],['instagram','Instagram'],['google','Google'],['tiktok','TikTok'],['zalo','Zalo'],['youtube','YouTube'],['meta','Meta'],['seo','SEO'],['referral','Giới thiệu'],['email','Email'],['other','Khác']];
  const names = Object.fromEntries(platforms);
  let report = null, options = null, offset = 0, order = 'created_at', direction = 'desc', requestId = 0;
  let editing = null, editorRevision = 0, saving = false, loading = false;
  const selected = new Set();
  const number = value => Number(value || 0).toLocaleString('vi-VN');
  const date = value => window.PageFPTDates?.format?.(value, false) || new Date(value).toLocaleDateString('vi-VN');
  const rate = (value, total) => total > 0 ? (100*value/total).toLocaleString('vi-VN',{maximumFractionDigits:1})+'%' : '—';
  function node(tag, text = '', cls = '') { const n=document.createElement(tag); n.textContent=text; n.className=cls; return n; }
  function option(parent,value,text){const n=node('option',text);n.value=value;parent.append(n);}
  function notice(text, error = false){$('lp-status').textContent=text;$('lp-status').classList.toggle('is-error',error);}
  const errors = {VERSION_CONFLICT:'Link đã được sửa. Làm mới rồi thử lại.',LINK_SLUG_EXISTS:'Tên link đã có. Chọn tên khác.',
    INVALID_LINK_TARGET:'Trang đích chưa công bố hoặc không được hỗ trợ.',LINK_SOURCE_IMMUTABLE:'Link đã có dữ liệu; tạo link mới cho nền tảng/content khác.',
    LINK_SLUG_IMMUTABLE:'Tên link đã lưu không đổi được. Hãy tạo link mới.',EDIT_VOUCHER_LINK_IN_VOUCHERS:'Đổi trang đích/nền tảng của link voucher trong mục Voucher.',
    PERMISSION_DENIED:'Cần quyền Marketing toàn hệ thống để quản lý và xem dữ liệu link.',INVALID_PLATFORM:'Chọn nền tảng được hỗ trợ.'};
  async function api(path,method='GET',data){const res=await adminFetch('/api/v1/admin/link-performance'+path,{method,
    signal:AbortSignal.timeout(10000),...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
    const result=await res.json();if(!res.ok)throw Error(errors[result.code]||result.message||'Chưa hoàn tất thao tác. Kiểm tra dữ liệu và thử lại.');return result;}
  function query(){const q=new URLSearchParams({start:$('lp-start').value,end:$('lp-end').value,order,direction,offset,limit:25});
    for(const [key,id] of [['platform','lp-filter-platform'],['creator','lp-filter-creator'],['kind','lp-filter-kind'],['q','lp-search']])if($(id).value.trim())q.set(key,$(id).value.trim());return q;}
  async function load(){const revision=++requestId;loading=true;for(const box of document.querySelectorAll('[data-link-select],#lp-select-all'))box.disabled=true;selection();notice('Đang tổng hợp kết quả…');$('lp-filter').querySelector('button[type=submit]').disabled=true;
    try{const data=await api('/report?'+query());if(revision!==requestId)return;report=data;selected.clear();render();notice('Đã tải '+number(data.total_count)+' link · Kết quả theo ngày nguồn, giờ Việt Nam.');}
    catch(e){if(revision===requestId)notice(e.message,true);}finally{if(revision===requestId){loading=false;$('lp-filter').querySelector('button[type=submit]').disabled=false;for(const box of document.querySelectorAll('[data-link-select],#lp-select-all'))box.disabled=false;selection();}}}
  function selection(){const count=selected.size;$('lp-selected').textContent=count?'Đã chọn '+count+' link':'Chưa chọn link';
    $('lp-bulk-pause').disabled=$('lp-bulk-activate').disabled=loading||!count;
    $('lp-select-all').checked=!!report?.items.length&&count===report.items.length;
    $('lp-select-all').indeterminate=count>0&&count<report.items.length;}
  function time(ms){if(ms==null)return 'Chưa đo';const seconds=Math.round(ms/1000);return seconds>=60?Math.floor(seconds/60)+'p '+seconds%60+'s':seconds+'s';}
  function render(){const t=report.totals;for(const key of ['clicks','forms','closed','installed'])$('lp-kpi-'+key).textContent=number(t[key]);
    $('lp-kpi-click-note').textContent=number(t.raw_clicks)+' GET · '+number(t.bot_clicks)+' bot/preview đã tách';
    $('lp-range').textContent='Mỗi link một nguồn content. Click/thời gian chỉ có từ lúc bắt đầu đo.';
    $('lp-rows').replaceChildren();
    for(const row of report.items){if(row.created_by&&!Array.from($('lp-filter-creator').options).some(o=>o.value===row.created_by))option($('lp-filter-creator'),row.created_by,row.creator_name);const tr=node('tr'),cell=node('td'),box=node('input');box.type='checkbox';box.disabled=loading;box.dataset.linkSelect=row.id;box.setAttribute('aria-label','Chọn '+row.payload.title);box.onchange=()=>{box.checked?selected.add(row.id):selected.delete(row.id);selection();};cell.append(box);tr.append(cell);
      const title=node('td'),button=node('button',row.payload.title,'lp-row-title');button.type='button';button.onclick=()=>open(row);const detail=node('button','Xem chuyển đổi','lp-row-detail');detail.type='button';detail.setAttribute('aria-label','Chuyển đổi: '+row.payload.title);detail.onclick=()=>showDetail(row);title.append(button,node('p',row.payload.content_note||'Chưa có ghi chú content','lp-row-note'),node('span',(row.kind==='voucher'?'/s/':'/r/')+row.slug,'lp-row-small'),node('span',row.payload.active?'Đang dùng':'Tạm dừng','lp-tag'+(row.payload.active?'':' is-paused')));title.append(detail);tr.append(title);
      const platform=node('td',(row.measured_platforms?.length?row.measured_platforms:[row.payload.platform]).map(p=>names[p]||p).join(' / '));platform.append(node('span',row.payload.utm_campaign||'Chưa gắn campaign','lp-row-small'));tr.append(platform,node('td',row.creator_name||'Không xác định'),node('td',date(row.created_at)));
      const clicks=node('td',number(row.clicks));clicks.append(node('span',number(row.raw_clicks)+' GET / '+number(row.bot_clicks)+' bot','lp-row-small'));tr.append(clicks);
      for(const key of ['forms','closed','installed'])tr.append(node('td',number(row[key])));
      const conversion=node('td',rate(row.closed,row.forms));conversion.append(node('span','Form/click: '+rate(row.forms,row.clicks),'lp-row-small'),node('span','Chốt/click: '+rate(row.closed,row.clicks),'lp-row-small'));tr.append(conversion);
      const duration=node('td',time(row.average_engagement_ms));duration.append(node('span',number(row.timed_visits)+' mẫu thời gian / '+number(row.measured_visits)+' phiên','lp-row-small'),node('span','Đo từ '+date(row.tracked_from),'lp-row-small'));tr.append(duration);
      const ranking=node('td',row.ranking.state==='ready'?'Cận dưới '+number(row.ranking.score)+'%':'Chưa đủ dữ liệu');ranking.append(node('span',number(row.ranking.samples)+' mẫu ≥7 ngày','lp-row-small'));
      ranking.title='Wilson theo phiên đã đồng ý đo: chưa phải tác động nhân quả hay tỷ lệ chốt trên mọi khách.';tr.append(ranking);$('lp-rows').append(tr);
    }
    if(!report.items.length){const tr=node('tr'),td=node('td','Chưa có link phù hợp. Tạo link content hoặc đổi bộ lọc.');td.colSpan=12;tr.append(td);$('lp-rows').append(tr);}
    $('lp-page-info').textContent=report.total_count?(offset+1)+'–'+Math.min(offset+report.items.length,report.total_count)+' / '+report.total_count:'0 link';
    $('lp-prev').disabled=offset===0;$('lp-next').disabled=offset+25>=report.total_count;
    for(const th of document.querySelectorAll('#lp-table th[data-order]'))th.setAttribute('aria-sort',th.dataset.order===order?(direction==='asc'?'ascending':'descending'):'none');
    selection();trend(report.daily);funnel(t);
  }
  function funnel(t){$('lp-funnel').replaceChildren();const max=Math.max(t.clicks,t.forms,t.closed,t.installed,1);for(const [title,value,color] of [['Click đã lọc',t.clicks,'#2563eb'],['Form đã lưu',t.forms,'#e8610b'],['Chốt còn hiệu lực',t.closed,'#07865f'],['Đã lắp đặt',t.installed,'#8b5cf6']]){const row=node('div','','lp-funnel-row'),track=node('div','','lp-funnel-track'),bar=node('div','','lp-funnel-fill');bar.style.width=(100*value/max)+'%';bar.style.background=color;track.append(bar);row.append(node('span',title),node('strong',number(value)),track);$('lp-funnel').append(row);} $('lp-funnel').append(node('p','Chốt/form: '+rate(t.closed,t.forms),'lp-muted'));}
  function trend(days){$('lp-trend').replaceChildren();if(!days.length){$('lp-trend').append(node('p','Chưa có dữ liệu trong kỳ.','lp-muted'));return;}
    const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 600 190');svg.setAttribute('role','img');svg.setAttribute('aria-label','Xu hướng click, form và đơn chốt theo ngày nguồn');
    const max=Math.max(...days.flatMap(d=>[Number(d.clicks),Number(d.forms),Number(d.closed)]),1);
    for(const y of [28,93,158]){const grid=document.createElementNS(NS,'line');grid.setAttribute('x1','20');grid.setAttribute('x2','580');grid.setAttribute('y1',y);grid.setAttribute('y2',y);grid.setAttribute('stroke','#e7edf5');svg.append(grid);}
    for(const [key,color] of [['clicks','#2563eb'],['forms','#e8610b'],['closed','#07865f']]){const path=document.createElementNS(NS,'polyline');path.setAttribute('points',days.map((d,i)=>(days.length===1?300:20+i*560/(days.length-1))+','+(158-Number(d[key])*130/max)).join(' '));path.setAttribute('stroke',color);path.setAttribute('stroke-width','3');path.setAttribute('fill','none');svg.append(path);for(const [i,d] of days.entries()){const point=document.createElementNS(NS,'circle'),title=document.createElementNS(NS,'title');point.setAttribute('cx',days.length===1?300:20+i*560/(days.length-1));point.setAttribute('cy',158-Number(d[key])*130/max);point.setAttribute('r','3');point.setAttribute('fill',color);title.textContent=date(d.day)+' · '+key+': '+number(d[key]);point.append(title);svg.append(point);}}
    for(const [x,d] of (days.length===1?[[250,days[0]]]:[[20,days[0]],[480,days.at(-1)]])){const text=document.createElementNS(NS,'text');text.setAttribute('x',x);text.setAttribute('y','183');text.setAttribute('fill','#64748b');text.setAttribute('font-size','12');text.textContent=date(d.day);svg.append(text);}$('lp-trend').append(svg);
  }

  let detailRevision=0;
  async function showDetail(row){const revision=++detailRevision;$('lp-detail-title').textContent='Chuyển đổi: '+row.payload.title;$('lp-detail-source').textContent=(row.kind==='voucher'?'/s/':'/r/')+row.slug+' · Người tạo: '+row.creator_name;$('lp-detail-state').textContent='Đang đối chiếu kết quả CRM…';$('lp-detail-closers').replaceChildren();$('lp-detail-quality').replaceChildren();for(const id of ['form-count','closed-count','installed-count','rate'])$('lp-detail-'+id).textContent='—';$('lp-detail').showModal();
    try{const params=query();params.set('link_id',row.id);params.set('offset','0');const data=await api('/report?'+params);if(revision!==detailRevision)return;const result=data.items[0];if(!result)throw Error('Không có dữ liệu cho link trong bộ lọc này.');
      $('lp-detail-form-count').textContent=number(result.forms);$('lp-detail-closed-count').textContent=number(result.closed);$('lp-detail-installed-count').textContent=number(result.installed);$('lp-detail-rate').textContent=rate(result.closed,result.forms);
      if(!data.closers.length)$('lp-detail-closers').append(node('p','Chưa có đơn chốt được đối chiếu nhân viên trong kỳ.','lp-muted'));
      for(const person of data.closers){const item=node('article','','lp-closer');item.append(node('strong',person.name),node('span',number(person.closed)+' đơn'),node('small',person.average_hours==null?'Chưa có thời gian chốt':'TB '+number(person.average_hours)+' giờ từ gửi form đến chốt'));$('lp-detail-closers').append(item);}
      for(const text of ['Click sau lọc: '+number(result.clicks)+' · Bot/preview: '+number(result.bot_clicks),'Thời gian tương tác TB: '+time(result.average_engagement_ms)+' · '+number(result.timed_visits)+' mẫu có checkpoint',number(result.measured_visits)+' phiên đồng ý phân tích; không phải số người duy nhất.','Form chưa có đơn chốt còn hiệu lực: '+number(result.forms-result.closed)+' · Data sai/trùng: '+number(result.invalid),'Hồ sơ đã xóa PII: '+number(result.erased)])$('lp-detail-quality').append(node('p',text,'lp-muted'));
      $('lp-detail-state').textContent='Kết quả CRM còn hiệu lực · '+date(data.start)+' – '+date(data.end);
    }catch(e){if(revision===detailRevision)$('lp-detail-state').textContent=e.message;}
  }
  $('lp-detail-close').onclick=()=>{++detailRevision;$('lp-detail').close();};$('lp-detail').addEventListener('cancel',()=>{++detailRevision;});

  function updatePreview(){$('lp-preview').textContent=new URL((editing?.kind==='voucher'?'/s/':'/r/')+($('lp-slug').value||'ten-link'),window.location.origin).href;}
  const fields=[['title','lp-title'],['slug','lp-slug'],['target','lp-target'],['platform','lp-platform'],['utm_medium','lp-utm-medium'],['utm_campaign','lp-utm-campaign'],['utm_content','lp-utm-content'],['content_note','lp-content-note']];
  function open(row=null){if(saving)return;editing=row;++editorRevision;$('lp-editor-error').hidden=true;const p=row?.payload||{target:'/',platform:'facebook',utm_medium:'social',active:true};
    if(p.platform&&!Array.from($('lp-platform').options).some(x=>x.value===p.platform))option($('lp-platform'),p.platform,p.platform);
    for(const [key,id] of fields){$(id).value=p[key]||'';$(id).disabled=key==='slug'&&!!row||row?.kind==='voucher'&&['target','platform','utm_medium','utm_campaign','utm_content'].includes(key);}
    $('lp-active').checked=p.active!==false;$('lp-editor-title').textContent=row?'Thiết lập link':'Tạo link content';
    $('lp-editor-owner').textContent=row?'Người tạo: '+row.creator_name+' · '+date(row.created_at):'Người tạo và thời điểm được lưu tự động từ tài khoản của bạn.';
    $('lp-editor-help').textContent=row?.kind==='voucher'?'Đổi đích/nền tảng trong mục Voucher. Ghi chú content có thể sửa tại đây.':'Sau khi có dữ liệu, UTM/nền tảng được giữ ổn định; tạo link khác cho content mới.';
    updatePreview();$('lp-editor').showModal();$('lp-title').focus();}
  async function save(e){e.preventDefault();if(saving)return;const revision=editorRevision,row=editing;const body=Object.fromEntries(fields.map(([key,id])=>[key,$(id).value.trim()]));body.active=$('lp-active').checked;
    if(row)body.expected_version=row.version;saving=true;$('lp-save').disabled=$('lp-close').disabled=true;$('lp-editor-error').hidden=true;
    try{await api(row?'/'+row.id:'',row?'PUT':'POST',body);if(revision===editorRevision){offset=0;await load();$('lp-editor').close();}}
    catch(error){if(revision===editorRevision){$('lp-editor-error').textContent=error.message;$('lp-editor-error').hidden=false;}}
    finally{saving=false;$('lp-save').disabled=$('lp-close').disabled=false;}}
  async function bulk(action){if(!selected.size)return;const items=report.items.filter(r=>selected.has(r.id)).map(r=>({id:r.id,expected_version:r.version}));
    $('lp-bulk-pause').disabled=$('lp-bulk-activate').disabled=true;
    try{const result=await api('/bulk','POST',{action,items});const count=result.items.filter(r=>r.saved).length;await load();notice('Đã xử lý '+count+'/'+items.length+' link'+(count<items.length?' · Có xung đột/quyền, hãy kiểm tra các mục còn lại.':''),count<items.length);}
    catch(e){notice(e.message,true);selection();}}
  function csv(){if(!report)return;const cell=v=>{let s=String(v??'');if(/^\s*[=+\-@]|^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const rows=[['Tên','Link','Nền tảng','Người tạo','Ngày tạo','Note','Click','Form','Chốt','Lắp','Thời gian TB ms','Phiên đo'],...report.items.map(r=>[r.payload.title,(r.kind==='voucher'?'/s/':'/r/')+r.slug,(r.measured_platforms?.length?r.measured_platforms:[r.payload.platform]).join(' / '),r.creator_name,date(r.created_at),r.payload.content_note,r.clicks,r.forms,r.closed,r.installed,r.average_engagement_ms,r.measured_visits])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='hieu-qua-link-trang-dang-xem.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('lp-filter').onsubmit=e=>{e.preventDefault();offset=0;load();};$('lp-refresh').onclick=load;$('lp-new-link').onclick=()=>open();$('lp-editor-form').onsubmit=save;
  $('lp-close').onclick=()=>{if(!saving)$('lp-editor').close();};$('lp-editor').addEventListener('cancel',e=>{if(saving)e.preventDefault();});$('lp-slug').oninput=updatePreview;
  $('lp-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('lp-preview').textContent);$('lp-copy').textContent='Đã sao chép';}catch(_){$('lp-copy').textContent='Chọn link để sao chép';}};
  $('lp-prev').onclick=()=>{offset=Math.max(0,offset-25);load();};$('lp-next').onclick=()=>{offset+=25;load();};$('lp-csv').onclick=csv;
  for(const th of document.querySelectorAll('#lp-table th[data-order]'))th.querySelector('button').onclick=()=>{direction=order===th.dataset.order&&direction==='desc'?'asc':'desc';order=th.dataset.order;offset=0;load();};
  $('lp-select-all').onchange=e=>{selected.clear();for(const row of report?.items||[])if(e.target.checked)selected.add(row.id);for(const box of document.querySelectorAll('[data-link-select]'))box.checked=selected.has(box.dataset.linkSelect);selection();};
  $('lp-bulk-pause').onclick=()=>bulk('pause');$('lp-bulk-activate').onclick=()=>bulk('activate');
  for(const [value,title] of platforms){option($('lp-platform'),value,title);option($('lp-filter-platform'),value,title);}
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $('lp-end').value=today;const start=new Date(today+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-29);$('lp-start').value=start.toISOString().slice(0,10);
  api('/options').then(data=>{options=data;for(const c of data.creators)option($('lp-filter-creator'),c.id,c.name);for(const t of data.targets)option($('lp-targets'),t.target,t.title);}).catch(()=>{});
  load();
})();
