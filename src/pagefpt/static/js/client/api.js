/** Real committed receipts only. A retry retains the same key and exact body. */
function generateUUID() {
  return window.crypto.randomUUID();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${['success','error','info'].includes(type) ? type : 'info'}`;
  const label = document.createElement('span');
  label.textContent = message;
  toast.appendChild(label);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

let pendingLead = null;
async function submitLeadToBackend(leadData) {
  leadData = {...leadData, ...(window.PageFPTVoucher?.leadContext?.() || {})};
  const body = JSON.stringify(leadData);
  // Auto-refreshed evidence must not turn an unresolved submission into a new one.
  // User input/consent changes do; preserve the original exact body until resolved.
  const transient = new Set(['quote_token','session_token','attribution_token','challenge_token']);
  const intent = JSON.stringify(Object.fromEntries(Object.entries(leadData)
    .filter(([key])=>!transient.has(key)).sort(([a],[b])=>a.localeCompare(b))));
  if (!pendingLead || pendingLead.intent !== intent) {
    pendingLead = { body, intent, key: generateUUID(), uncertain:false };
  }
  const submission = pendingLead;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('/api/v1/leads', {
        method: 'POST', headers: {'Content-Type':'application/json', 'Idempotency-Key':submission.key},
        body: submission.body, signal: AbortSignal.timeout(8000)
      });
      if(response.status>=500) submission.uncertain=true;
      const result = await response.json();
      if (!response.ok) {
        // An explicit client rejection confirms no commit for this attempt.
        // Permit corrected challenge/proof fields on the next manual submit.
        if(response.status>=400 && response.status<500 && !submission.uncertain && pendingLead===submission) pendingLead=null;
        const error = new Error(result.code === 'CHALLENGE_REQUIRED'
          ? 'Cần xác minh bổ sung. Vui lòng liên hệ tư vấn hoặc thử lại sau.'
          : result.code === 'RATE_LIMITED' ? 'Bạn đã gửi nhiều yêu cầu. Vui lòng chờ rồi thử lại.'
          : 'Chưa tiếp nhận yêu cầu. Vui lòng kiểm tra thông tin và gửi lại.');
        error.code = result.code;
        error.retryable = response.status === 503;
        throw error;
      }
      if (!result.receipt || !result.event_id) {
        submission.uncertain=true;
        throw Object.assign(new Error('Phản hồi tiếp nhận không hợp lệ.'), {retryable:false});
      }
      if (pendingLead === submission) pendingLead = null;
      // Only a committed receipt can become a conversion. Never pass contact fields.
      window.dispatchEvent?.(new CustomEvent('pagefpt:lead-accepted', {detail:{
        event_id:result.event_id, plan_id:leadData.plan_id,
        billing_months:leadData.billing_months || Number((leadData.notes || '').match(/Kỳ thanh toán quan tâm: (1|6|12) tháng/)?.[1]),
        accessory_count:Array.isArray(leadData.accessory_ids) ? leadData.accessory_ids.length : 0
      }}));
      return {...result, success:true};
    } catch (error) {
      if(!error.code && error.retryable!==false) submission.uncertain=true;
      if (attempt === 2 || error.retryable === false || (error.code && !error.retryable)) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
}
