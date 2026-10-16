/* Wizard navigation only; settings remain drafts until the existing publish endpoint. */
(() => {
  const states=new WeakMap();
  function reveal(input){
    for(let p=input.parentElement;p&&!p.matches('form');p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;
    input.reportValidity();input.focus();
  }
  function valid(panel){for(const n of panel.querySelectorAll('input,select,textarea'))if(!n.disabled&&!n.closest('[hidden]')&&!n.checkValidity()){reveal(n);return false;}return true;}
  function summary(form){const box=form.querySelector('[data-ms-summary]');box.replaceChildren();
    const values=[['Tên',form.elements.name.value||'Chưa đặt tên'],['Môi trường',form.elements.environment.value]];
    if(form.elements.scope)values.push(['Phạm vi',form.elements.scope.options[form.elements.scope.selectedIndex].text+' · '+form.elements.scope_key.value],['Liên kết',form.elements.override_rules.checked?form.querySelectorAll('.ms-rule').length+' sự kiện/đích riêng':'Kế thừa từ phạm vi trên']);
    else values.push(['Nền tảng',form.elements.provider.options[form.elements.provider.selectedIndex].text],['Trạng thái',form.elements.enabled.checked?'Cho phép sử dụng':'Đang tắt']);
    const dl=document.createElement('dl');dl.className='ms-data';for(const [label,value] of values){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;dl.append(dt,dd);}box.append(dl);
  }
  function go(form,index,focus=true){const s=states.get(form);if(!s)return;
    if(index>s.index)for(let i=0;i<index;i++){s.panels.forEach((p,n)=>p.hidden=n!==i);if(!valid(s.panels[i])){s.index=i;paint(form);return false;}}
    s.index=index;paint(form);if(focus){const title=s.panels[index].querySelector('h3');title.tabIndex=-1;title.focus();}return true;
  }
  function paint(form){const s=states.get(form),last=s.index===s.panels.length-1;
    s.panels.forEach((p,n)=>p.hidden=n!==s.index);form.querySelectorAll('[data-ms-step]').forEach((b,n)=>{if(n===s.index)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    form.querySelector('[data-ms-prev]').hidden=s.index===0;form.querySelector('[data-ms-next]').hidden=last;form.querySelectorAll('[data-ms-finish]').forEach(b=>b.hidden=!last);
    form.querySelector('[data-ms-step-status]').textContent='Bước '+(s.index+1)+' / '+s.panels.length;if(last)summary(form);
  }
  function install(){for(const form of document.querySelectorAll('[data-ms-wizard]')){
    form.noValidate=true;states.set(form,{index:0,panels:[...form.querySelectorAll('[data-ms-step-panel]')]});
    form.querySelectorAll('[data-ms-step]').forEach(b=>b.onclick=()=>go(form,Number(b.dataset.msStep)));
    form.querySelector('[data-ms-prev]').onclick=()=>go(form,states.get(form).index-1);
    form.querySelector('[data-ms-next]').onclick=()=>go(form,states.get(form).index+1);
    form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'&&states.get(form).index<states.get(form).panels.length-1){e.preventDefault();go(form,states.get(form).index+1);}});
    paint(form);
  }}
  function validateAll(form){const s=states.get(form);for(let i=0;i<s.panels.length;i++){s.panels.forEach((p,n)=>p.hidden=n!==i);if(!valid(s.panels[i])){s.index=i;paint(form);return false;}}paint(form);return true;}
  function checks(box,data){box.replaceChildren();const title=document.createElement('h3');title.textContent='Kết quả kiểm tra';box.append(title);
    const labels={pass:'Đạt',warning:'Cần lưu ý',fail:'Chưa đạt'};
    for(const item of data.checks||[]){const card=document.createElement('article'),label=document.createElement('strong'),p=document.createElement('p');card.className='ms-diagnostic ms-diagnostic-'+(labels[item.status]?item.status:'warning');label.textContent=(labels[item.status]||'Cần lưu ý')+' · '+({account:'Nguồn dữ liệu',reporting:'Báo cáo/chi phí',browser:'Trình duyệt',credentials:'Khóa truy cập',delivery:'Sự kiện nhận',enabled:'Trạng thái'}[item.key]||'Kiểm tra');p.textContent=item.message;card.append(label,p);if(item.next_step){const next=document.createElement('p');next.textContent='Việc cần làm: '+item.next_step;card.append(next);}box.append(card);}
  }
  window.PageFPTMeasurementSteps={install,reset:form=>{const s=states.get(form);s.index=0;paint(form);},validateAll,checks};
})();
