/* Source-intent popup; campaign state comes from the server, never the URL. */
(() => {
  if ((typeof analyticsPreview === 'function' && analyticsPreview()) || document.body?.dataset?.landingPreview === 'true') return;
  const get = id => document.getElementById(id), dialog = get('voucher-acquisition');
  if (!dialog) return;
  const reminder = get('voucher-acquisition-reminder');
  let marker = null, autoShown = false, contextReady = false, completedFor = null, state = null;
  const original = new URL(window.location.href);
  marker = original.searchParams.get('pf_offer');
  if (marker) { original.searchParams.delete('pf_offer'); window.history.replaceState(window.history.state, '', original); }
  const money = n => Number(n).toLocaleString('vi-VN') + 'đ';
  const day = value => window.PageFPTDates?.format(value, false) || new Date(value).toLocaleDateString('vi-VN');
  const current = () => window.PageFPTVoucher?.current?.();
  function eligible(v) {
    return !!v && v.status === 'active' && !v.sold_out &&
      Date.parse(v.start) <= Date.now() && Date.now() < Date.parse(v.end) &&
      (!marker || v.link?.slug === marker);
  }
  function render() {
    const v = current(), valid = eligible(v); state = valid ? v : null;
    get('voucher-acquisition-title').textContent = valid ? 'Chúc mừng! Bạn nhận được ưu đãi' : 'Cùng tìm ưu đãi phù hợp';
    get('voucher-acquisition-label').textContent = valid ? v.name : 'Ưu đãi từ link này hiện chưa sẵn sàng. Bạn vẫn có thể nhận tư vấn gói phù hợp.';
    get('voucher-acquisition-code').textContent = valid ? v.code : 'Chưa áp dụng';
    get('voucher-acquisition-end').textContent = valid ? day(v.end) : 'Nhân viên kiểm tra';
    get('voucher-acquisition-terms').textContent = valid ? v.terms : 'Mã chưa công bố, chưa bắt đầu hoặc đã ngừng không được áp dụng. Nhân viên sẽ kiểm tra ưu đãi đang có theo địa chỉ của bạn.';
    const benefits = get('voucher-acquisition-benefits'); benefits.replaceChildren();
    if (valid) {
      for (const b of (v.benefits || []).slice(0, 3)) {
        const pieces = [];
        const effective = b.discount_kind === 'percent' ? b.amount : Math.min(b.amount || 0, b.cap_vnd ?? b.amount ?? 0);
        if (effective > 0 && b.cap_vnd !== 0) pieces.push(b.discount_kind === 'percent' ? `Giảm ${b.amount / 100}%${b.cap_vnd != null ? ' (tối đa ' + money(b.cap_vnd) + ')' : ''}` : 'Giảm ' + money(effective));
        if (b.gift_name) pieces.push('Quà tặng: ' + b.gift_name);
        if (!pieces.length) continue;
        const basis = {monthly:'cước theo tháng',initial:'thanh toán ban đầu',setup:'phí hòa mạng',equipment:'tiền thiết bị'}[b.basis];
        const item = document.createElement('p'); item.textContent = pieces.join(' · ') + (basis && b.amount > 0 ? ' cho ' + basis : '') + ' · ' + (b.region_name || 'Theo địa bàn') + (b.sold_out ? ' · Cần xác nhận lại suất' : '');
        benefits.append(item);
      }
      const note = document.createElement('p'); note.textContent = 'Ưu đãi được xác nhận theo gói, địa bàn và kỳ thanh toán. Mã chưa đồng nghĩa đã giữ suất.'; benefits.append(note);
    }
    get('voucher-acquisition-use').textContent = valid ? 'Sử dụng ngay →' : 'Nhận tư vấn ngay →';
    get('voucher-acquisition-reminder-label').textContent = valid ? 'Dùng mã ' + v.code : 'Nhận tư vấn ưu đãi';
    const summary = get('form-voucher-summary');
    if (summary) { summary.hidden = !valid; summary.textContent = valid ? 'Mã ' + v.code + ' · ' + v.label + ' · Nhân viên xác nhận điều kiện' : ''; }
    reminder.hidden = !(marker || v?.link) || completedFor === (v?.id || marker);
  }
  function show() {
    render();
    if (dialog.open) return true;
    if (document.querySelector('dialog[open], .bottom-sheet-backdrop.active')) return false;
    dialog.showModal(); get('voucher-acquisition-use').focus(); return true;
  }
  get('voucher-acquisition-close').addEventListener('click', () => dialog.close());
  get('voucher-acquisition-later').addEventListener('click', () => dialog.close());
  reminder.addEventListener('click', show);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  get('voucher-acquisition-use').addEventListener('click', () => {
    render(); dialog.close();
    if (typeof openBottomSheet === 'function') {
      openBottomSheet(state ? 'Ưu đãi ' + state.name : 'Tư vấn ưu đãi phù hợp', '', null, state?.services?.[0] || null);
      get('lead-phone')?.focus();
    }
  });
  window.addEventListener('pagefpt-voucher-change', () => {
    contextReady = true; render();
    if (marker && !autoShown) autoShown = show();
  });
  window.addEventListener('pagefpt:lead-accepted', () => { completedFor = current()?.id || marker; reminder.hidden = true; dialog.close(); });
  window.PageFPTVoucherAcquisition = {open:show,refresh:render};
  // Wait for other sheets to close instead of stacking focus traps.
  if (typeof MutationObserver === 'function') {
    const watcher = new MutationObserver(() => {
      if (marker && !autoShown && completedFor === null && contextReady) autoShown = show();
    });
    document.querySelectorAll('dialog, .bottom-sheet-backdrop').forEach(el => {
      if (el !== dialog) watcher.observe(el, {attributes:true, attributeFilter:['class','open']});
    });
  }
  if (current()) { contextReady = true; render(); if (marker) autoShown = show(); }
})();
