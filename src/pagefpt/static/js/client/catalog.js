function getPublishedPlans() {
  try {
    const plans=JSON.parse(document.getElementById('published-plans-data')?.textContent || '[]');
    return Array.isArray(plans) ? plans : [];
  } catch (_) { return []; }
}
/** All visible prices come from the same quote boundary used by intake. */
let catalogQuoteGeneration=0;
function selectPublishedPlan(button) {
  openBottomSheet(button.dataset.planName, '', button.dataset.planId);
}
function comparePublishedPlan(button) {
  const fee=button.closest('.card-face')?.querySelector('[data-quote-plan]')?.textContent || 'Cần tư vấn';
  toggleCompare(button.dataset.planId,button.dataset.planName,button.dataset.speed,fee,button.dataset.equipment || 'Cần tư vấn');
}
async function refreshCatalogPrices(regionId=null) {
  const generation=++catalogQuoteGeneration;
  const labels=Array.from(document.querySelectorAll('[data-quote-plan]'));
  const region=regionId || (typeof getSelectedRegionId==='function' ? getSelectedRegionId() : document.getElementById('form-lead-province')?.value) || null;
  const ids=Array.from(new Set(labels.map(el=>el.dataset.quotePlan)));
  labels.forEach(el=>el.textContent='Cần tư vấn');
  if(typeof compareItems!=='undefined') {
    compareItems.forEach(item=>item.fee='Cần tư vấn');
    if(typeof renderCompareCards==='function') renderCompareCards();
  }
  document.querySelectorAll('[data-quote-note]').forEach(el=>el.textContent='Chọn khu vực để xác nhận giá, VAT và kỳ thanh toán.');
  if (!region || !/^[0-9a-f-]{36}$/i.test(region)) return;
  let index=0;
  async function worker() {
    while(index<ids.length && generation===catalogQuoteGeneration) {
      const id=ids[index++];
      try {
        const response=await fetch('/api/v1/quotes',{method:'POST',signal:AbortSignal.timeout(3000),headers:{'Content-Type':'application/json'},body:JSON.stringify({plan_id:id,region_id:region,billing_months:6})});
        if (!response.ok) continue;
        const quote=await response.json();
        if(generation!==catalogQuoteGeneration) continue;
        if(quote.status==='not_available'){labels.filter(el=>el.dataset.quotePlan===id).forEach(el=>el.textContent='Chưa cung cấp tại địa bàn này');document.querySelectorAll('[data-quote-note]').forEach(el=>{if(el.dataset.quoteNote===id)el.textContent='Chọn địa bàn khác hoặc gửi yêu cầu tư vấn gói phù hợp.';});continue;}
        if(quote.status!=='confirmed') continue;
        const amount=new Intl.NumberFormat('vi-VN').format(quote.monthly_vnd);
        const total=new Intl.NumberFormat('vi-VN').format(quote.initial_total_vnd);
        labels.filter(el=>el.dataset.quotePlan===id).forEach(el=>el.textContent=Number.isInteger(quote.monthly_vnd)?`${amount}đ/tháng`:`Trả trước: ${total}đ`);
        if(typeof compareItems!=='undefined') {
          const item=compareItems.find(item=>item.id===id);
          if(item) item.fee=Number.isInteger(quote.monthly_vnd)?`${amount}đ/tháng`:`Trả trước: ${total}đ`;
          if(typeof renderCompareCards==='function') renderCompareCards();
        }
        document.querySelectorAll('[data-quote-note]').forEach(el=>{if(el.dataset.quoteNote===id) el.textContent=`${quote.vat_included?'Đã gồm VAT':'Chưa gồm VAT'} · Trả ${quote.billing_months} tháng · Ban đầu ${total}đ`;});
      } catch (_) { /* Keep consultation state; never invent a fallback price. */ }
    }
  }
  await Promise.all(Array.from({length:Math.min(3,ids.length)},worker));
}
document.addEventListener('DOMContentLoaded',()=>refreshCatalogPrices());
