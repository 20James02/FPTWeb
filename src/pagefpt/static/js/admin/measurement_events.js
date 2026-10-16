/* Typed event links, with provider-specific fields and guarded defaults. */
(() => {
  window.createMeasurementEventEditor=({connections,form,box,el,field,button,describe,events})=>{
    const sources={lead:'Form đã lưu thành công',qualified:'Khách đủ điều kiện',closed:'Đã chốt gói',installed:'Đã lắp đặt',...Object.fromEntries(Object.entries(events).filter(([key])=>key!=='generate_lead'))};
    const crm=new Set(['qualified','closed','installed']);
    const suggestion=(provider,event)=>provider==='ga4'?(event==='lead'?'generate_lead':crm.has(event)?'crm_'+event:event):provider==='meta'?({page_view:'PageView',view_plan:'ViewContent',select_plan:'ViewContent',click_call:'Contact',click_zalo:'Contact',click_messenger:'Contact',lead:'Lead',qualified:'QualifiedLead',closed:'ClosedWon',installed:'ServiceInstalled'}[event]||event):event;
    function add(rule={}){
      if(box.children.length>=100)throw Error('Mỗi cấu hình tối đa 100 liên kết.');
      const card=el('details','','ms-rule'),header=el('summary','Liên kết sự kiện'),grid=el('div','','ms-form-grid');card.dataset.id=rule.id||crypto.randomUUID();card.open=Object.keys(rule).length===0;
      const source=field(grid,'event','Sự kiện tại website / CRM','text',Object.entries(sources));source.value=rule.event||'lead';
      const target=field(grid,'connection_id','Nơi nhận dữ liệu','text',[['','Chọn kết nối đã bật'],...connections().filter(c=>c.payload.enabled&&c.payload.environment===form.elements.environment.value).map(c=>[c.id,c.payload.name])]);
      if(rule.connection_id&&!Array.from(target.options).some(o=>o.value===rule.connection_id)){const o=el('option','Kết nối đã tắt / khác môi trường');o.value=rule.connection_id;target.append(o);}
      target.value=rule.connection_id||'';
      const name=field(grid,'provider_event','Tên sự kiện trên nền tảng');name.maxLength=40;name.pattern='[A-Za-z][A-Za-z0-9_]*';name.required=true;name.value=rule.provider_event||'';
      const route=field(grid,'route','Cách gửi','text',[['browser','Trình duyệt'],['server','Máy chủ CRM'],['ga4_import','GA4 → Ads (thiết lập thêm trong Google)']]);route.value=rule.route||'browser';
      const label=field(grid,'conversion_label','Conversion Label (Ads trình duyệt)');label.value=rule.conversion_label||'';
      const action=field(grid,'conversion_action','Conversion Action (Ads máy chủ)');action.value=rule.conversion_action||'';
      const value=field(grid,'value_vnd','Giá trị mục tiêu VND (không phải doanh thu)','number');value.min=0;value.max=1000000000;value.value=rule.value_vnd||0;
      const primaryLabel=el('label','Dùng làm mục tiêu tối ưu chính','ms-check'),primary=el('input');primary.type='checkbox';primary.name='primary';primary.checked=!!rule.primary;primaryLabel.prepend(primary);grid.append(primaryLabel);
      const hint=el('p','','ms-help-note');let suggested='',previousEvent=source.value;
      function update(changed=false){const c=connections().find(c=>c.id===target.value),behavior=!crm.has(source.value)&&source.value!=='lead',provider=c?.payload.provider;
        header.textContent=sources[source.value]+' → '+(c?.payload.name||'Chọn kết nối');
        if(changed&&source.value!==previousEvent){route.value=crm.has(source.value)?'server':'browser';previousEvent=source.value;}
        for(const option of route.options)option.disabled=behavior?option.value!=='browser':crm.has(source.value)?option.value==='browser':option.value==='ga4_import'&&provider!=='ga4';
        if(provider!=='ga4'&&route.value==='ga4_import')route.value=crm.has(source.value)?'server':'browser';
        if(behavior){route.value='browser';primary.checked=false;value.value=0;}
        primary.disabled=behavior;value.disabled=behavior;
        const next=suggestion(provider,source.value);if(!name.value||name.value===suggested)name.value=next;suggested=next;
        label.closest('label').hidden=provider!=='google_ads'||route.value!=='browser';label.required=provider==='google_ads'&&route.value==='browser';
        action.closest('label').hidden=provider!=='google_ads'||route.value!=='server';action.required=provider==='google_ads'&&route.value==='server';
        target.required=true;
        hint.textContent=behavior?'Hành vi tham khảo: chỉ gửi trên trình duyệt khi có lựa chọn dữ liệu phù hợp; không tính là form, doanh thu hoặc mục tiêu tối ưu chính.':crm.has(source.value)?'Kích hoạt khi nhân viên hoàn tất đúng bước trong CRM. Gửi qua hàng đợi máy chủ; không tạo từ lượt nhấn trên website.':'Chỉ kích hoạt khi máy chủ đã lưu form. GA4 dùng generate_lead có sẵn để tránh gửi trùng.';
        if(provider==='ga4'&&route.value==='browser')hint.textContent+=' Chọn chính kết nối GA4 ở bước 2; tên bên trên thay tên mặc định của hành vi đó.';
        if(provider==='google_ads')hint.textContent+=' Conversion Label/Action lấy từ chính hành động chuyển đổi trong Ads; tên sự kiện không thay thế các mã này.';
      }
      source.onchange=()=>update(true);target.onchange=()=>update();route.onchange=()=>update();update();
      card.append(header,grid,hint,button('Bỏ liên kết',()=>card.remove()));box.append(card);form.elements.override_rules.checked=true;box.hidden=false;return card;
    }
    return {add,sources,allGA4(){const id=form.elements.ga4_connection_id.value,c=connections().find(c=>c.id===id&&c.payload.provider==='ga4'&&c.payload.enabled&&c.payload.environment===form.elements.environment.value);if(!c)throw Error('Chọn kết nối GA4 đã bật, cùng môi trường ở bước 2 trước.');for(const [event]of Object.entries(sources)){if(crm.has(event))continue;if([...box.children].some(card=>card.querySelector('[name=event]').value===event&&card.querySelector('[name=connection_id]').value===id))continue;add({event,connection_id:id,provider_event:suggestion('ga4',event),route:'browser'});}}};
  };
})();
