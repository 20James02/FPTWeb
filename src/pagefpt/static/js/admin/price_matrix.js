/* Direct period prices. The server commits the selected rows in one transaction. */
(() => {
  const $ = (id) => document.getElementById(id);
  let selectedRows = new Map(), opening = 0, saving = false, legacyPeriod = null;
  const periods = () => [...new Set([1, 6, 12, ...(legacyPeriod ? [legacyPeriod] : [])])];
  const directMonthly = row => adminDraftCost({ ...row, billing_months: 1, setup_vnd: 0, equipment_vnd: 0, vat_included: true });
  const input = (months, field) => $(`period-${months}-${field}`);
  const node = (tag, text = '') => pricingNode(tag, text);
  function field(months, key, label, options = {}) {
    const wrap = node('label', label), el = document.createElement(options.area ? 'textarea' : 'input');
    el.id = `period-${months}-${key}`;
    if (options.money) { el.dataset.money = ''; el.inputMode = 'numeric'; }
    if (options.number) { el.type = 'number'; el.min = '0'; el.max = '36'; el.step = '1'; }
    if (options.area) { el.rows = 3; el.maxLength = 4019; }
    if (options.required) el.required = true;
    if (options.value != null) el.value = options.value;
    wrap.append(el);
    return wrap;
  }
  function drawPeriod(months, row, enabled, candidates = []) {
    const card = node('section'); card.className = 'price-period'; card.dataset.pricePeriod = months;
    const heading = node('div'); heading.className = 'price-period-heading';
    const label = node('label'); label.className = 'pricing-check';
    const check = document.createElement('input'); check.type = 'checkbox'; check.id = `period-${months}-enabled`; check.checked = enabled;
    label.append(check, document.createTextNode(`Lưu kỳ ${months} tháng`));
    heading.append(label); card.append(heading);
    const state = node('p', row ? pricingStatusLabel(row.status) : 'Tạo giá mới');
    state.id = `period-${months}-state`; state.className = 'pricing-hint'; card.append(state);
    if (candidates.length > 1) {
      const pickerLabel = node('label', 'Phiên bản cần sửa'); const select = document.createElement('select');
      select.id = `period-${months}-version`;
      select.append(new Option('Chọn phiên bản để sửa…', ''));
      for (const item of candidates) select.append(new Option(`${pricingStatusLabel(item.status)} · ${pricingLocalDate(item.start)} · ${moneyFormat.format(directMonthly(item))}đ`, item.id));
      select.value = row?.id || '';
      select.addEventListener('change', () => {
        const chosen = candidates.find(r => r.id === select.value);
        selectedRows.delete(months);
        if (chosen) selectedRows.set(months, chosen);
        populate(months, chosen); check.checked = !!chosen;
        sync(months); preview();
      });
      pickerLabel.append(select); card.append(pickerLabel);
    }
    const body = node('fieldset'); body.id = `period-${months}-fields`; body.className = 'price-period-fields';
    const legend = node('legend', `Giá và thiết bị kỳ ${months} tháng`); legend.className = 'sr-only'; body.append(legend);
    body.append(
      field(months, 'monthly', 'Cước tính tiền / tháng (VND) *', { money: true, required: true }),
      field(months, 'display', 'Giá bình quân hiển thị / tháng (VND)', { money: true }),
      field(months, 'setup', 'Phí hòa mạng (VND)', { money: true, value: '0' }),
      field(months, 'equipment-fee', 'Phí thiết bị (VND)', { money: true, value: '0' }),
      field(months, 'gift', 'Tặng thêm (tháng)', { number: true, value: '0' }),
    );
    const vat = field(months, 'vat', 'VAT (%)'); const vatInput = vat.querySelector('input');
    Object.assign(vatInput, { type: 'number', min: '0', max: '100', step: '0.01', value: '0' }); body.append(vat);
    const includedLabel = node('label', ''); includedLabel.className = 'pricing-check';
    const included = document.createElement('input'); included.type = 'checkbox'; included.id = `period-${months}-vat-included`; included.checked = true;
    includedLabel.append(included, document.createTextNode('Cước và phí đã gồm VAT')); body.append(includedLabel);
    const inheritLabel = node('label'); inheritLabel.className = 'pricing-check';
    const inherit = document.createElement('input'); inherit.type = 'checkbox'; inherit.id = `period-${months}-inherit`; inherit.checked = true;
    inheritLabel.append(inherit, document.createTextNode('Dùng thiết bị mặc định của gói')); body.append(inheritLabel);
    const equipment = field(months, 'equipment', 'Thiết bị riêng (mỗi dòng một mục)', { area: true });
    equipment.id = `period-${months}-equipment-control`; body.append(equipment);
    card.append(body);
    const note = node('p'); note.id = `period-${months}-preview`; note.className = 'price-period-preview'; note.setAttribute('aria-live', 'polite'); card.append(note);
    $('price-periods').append(card);
    populate(months, row);
    check.addEventListener('change', () => { sync(months); preview(); });
    inherit.addEventListener('change', () => sync(months));
    sync(months);
  }
  function populate(months, row) {
    const monthly = row ? directMonthly(row) : '';
    for (const [key, value] of Object.entries({ monthly, display: row?.display_monthly_vnd ?? '', setup: row?.setup_vnd ?? 0, 'equipment-fee': row?.equipment_vnd ?? 0, gift: row?.gift_months ?? 0, vat: (row?.vat_bps ?? 0) / 100, equipment: (row?.equipment || []).join('\n') })) input(months, key).value = value;
    input(months, 'vat-included').checked = row?.vat_included ?? true;
    input(months, 'inherit').checked = row?.equipment == null;
    input(months, 'state').textContent = row ? `${pricingStatusLabel(row.status)}${row.status === 'published' ? ' · Tạo phiên bản thay thế khi lưu' : ''}` : 'Tạo giá mới';
    formatPricingMoney();
  }
  function sync(months) {
    input(months, 'fields').disabled = !input(months, 'enabled').checked;
    input(months, 'equipment-control').hidden = input(months, 'inherit').checked;
    input(months, 'equipment').disabled = input(months, 'inherit').checked;
    const published = periods().some(n => input(n, 'enabled')?.checked && selectedRows.get(n)?.status === 'published');
    $('price-publish-now').disabled = published;
    if (published) $('price-publish-now').checked = true;
    $('btn-submit-price').textContent = published ? 'Lưu & công bố các kỳ đã chọn' : 'Lưu các kỳ đã chọn';
  }
  function periodPrice(months) {
    const equipment = input(months, 'equipment').value.split('\n').map(s => s.trim()).filter(Boolean);
    if (equipment.length > 20 || equipment.some(s => s.length > 200)) throw Error(`Kỳ ${months} tháng: tối đa 20 thiết bị, mỗi mục 200 ký tự.`);
    return {
      billing_months: months, monthly_vnd: pricingMoney(input(months, 'monthly').id),
      display_monthly_vnd: input(months, 'display').value.trim() === '' ? null : pricingMoney(input(months, 'display').id),
      setup_vnd: pricingMoney(input(months, 'setup').id), equipment_vnd: pricingMoney(input(months, 'equipment-fee').id),
      equipment: input(months, 'inherit').checked ? null : equipment,
      gift_months: Number(input(months, 'gift').value), vat_bps: Math.round(Number(input(months, 'vat').value) * 100),
      vat_included: input(months, 'vat-included').checked,
    };
  }
  function preview() {
    if (!$('price-periods')) return;
    for (const months of periods()) {
      const note = input(months, 'preview'); if (!note) continue;
      if (!input(months, 'enabled').checked) { note.textContent = 'Kỳ này được giữ nguyên.'; continue; }
      try {
        if (!input(months, 'monthly').value.trim()) throw Error();
        const p = periodPrice(months), term = p.monthly_vnd * months, service = months + p.gift_months;
        note.textContent = `Cước trả trước ${moneyFormat.format(term)}đ · Sử dụng ${service} tháng · Ban đầu ${moneyFormat.format(adminDraftCost(p))}đ (chưa trừ ưu đãi). Bình quân tham chiếu ${moneyFormat.format(Math.round(term / service))}đ/tháng.`;
        if (p.display_monthly_vnd !== null) note.textContent += ` Hiển thị ${moneyFormat.format(p.display_monthly_vnd)}đ/tháng.`;
      } catch (_) { note.textContent = 'Nhập cước và các phí để xem tổng dự kiến.'; }
    }
  }
  async function open(row = null, clone = false) {
    const generation = ++opening;
    selectedRows = new Map(); legacyPeriod = row && ![1,6,12].includes(row.billing_months) ? row.billing_months : null;
    editingPrice = clone ? null : row;
    cloningGroupScopeId = clone && row?.scope_kind === 'group' ? row.scope_id : null;
    $('create-price-form').reset(); pricingClearError('price-error');
    $('price-publish-control').hidden = false; $('price-publish-now').disabled = false;
    $('inp-plan-id').replaceChildren(new Option('Chọn gói cước…', ''));
    for (const plan of availablePlans.filter(p => p.status !== 'retired')) $('inp-plan-id').append(new Option(plan.payload.name, plan.id));
    $('inp-plan-id').disabled = !!editingPrice; $('inp-scope-kind').disabled = !!editingPrice;
    if (row?.scope_kind === 'group' && ![...$('inp-scope-kind').options].some(o => o.value === 'group')) $('inp-scope-kind').append(new Option('Nhóm giá hiện tại', 'group'));
    if (row) { $('inp-plan-id').value = row.plan_id; $('inp-scope-kind').value = row.scope_kind; $('inp-source').value = row.source; }
    $('inp-start').value = pricingLocalDate(row?.status === 'published' && !clone ? Math.max(Date.now()+1000, Date.parse(row.start)+1000) : row?.start || Date.now());
    $('inp-end').value = row?.end ? pricingLocalDate(row.end) : '';
    $('price-dialog-title').textContent = clone ? 'Nhân bản giá theo kỳ' : row ? 'Quản lý giá các kỳ 1 / 6 / 12 tháng' : 'Thêm giá cho 3 kỳ thanh toán';
    $('price-version-note').textContent = 'Một lần lưu cho các kỳ đã chọn. Có lỗi ở bất kỳ kỳ nào thì toàn bộ lần lưu được hoàn tác. Bỏ chọn kỳ không làm ngừng giá hiện có.';
    pricePicker = new PricingLocationPicker($('price-location-picker'), row?.scope_kind === 'region' ? [row.scope_id] : []);
    onScopeKindChange($('inp-scope-kind').value);
    $('price-periods').replaceChildren(); $('btn-submit-price').disabled = true;
    openPricingDialog('create-price-backdrop');
    try {
      const related = row && !clone ? (await pricingApi('/api/v1/admin/prices/matrix?id=' + encodeURIComponent(row.id))).items : row ? [row] : [];
      if (generation !== opening || !$('create-price-backdrop').open) return;
      for (const months of periods()) {
        const candidates = related.filter(p => p.billing_months === months);
        const chosen = row?.billing_months === months ? row : candidates.length === 1 ? candidates[0] : null;
        if (chosen && !clone) selectedRows.set(months, chosen);
        drawPeriod(months, chosen, !row || !!chosen, candidates);
      }
      sync(periods()[0]); preview();
      if (related.some(p => p.status === 'published')) {
        const start = Math.max(Date.now()+1000, ...[...selectedRows.values()].filter(p => p.status==='published').map(p => Date.parse(p.start)+1000));
        if (!clone) $('inp-start').value = pricingLocalDate(start);
      }
    } catch (e) { pricingError('price-error', e); }
    finally { if (generation === opening) $('btn-submit-price').disabled = !$('price-periods').children.length; }
  }
  async function save(event) {
    event.preventDefault(); if (saving) return;
    pricingClearError('price-error'); const button = $('btn-submit-price'); button.disabled = true; saving = true;
    try {
      const active = periods().filter(n => input(n, 'enabled')?.checked);
      if (!active.length) throw Error('Chọn ít nhất một kỳ thanh toán để lưu.');
      const scopeKind = $('inp-scope-kind').value;
      const scopes = editingPrice ? [editingPrice.scope_id] : scopeKind === 'default' ? [PRICING_ZERO] : scopeKind === 'group' && cloningGroupScopeId ? [cloningGroupScopeId] : [...pricePicker.selected];
      if (!scopes.length) throw Error('Chọn ít nhất một địa bàn hoặc giá mặc định.');
      if (active.length * scopes.length > 500) throw Error('Mỗi lần lưu tối đa 500 tổ hợp kỳ và địa bàn.');
      const base = { plan_id: $('inp-plan-id').value, scope_kind: scopeKind, source: $('inp-source').value.trim(), start: new Date($('inp-start').value).toISOString(), end: $('inp-end').value ? new Date($('inp-end').value).toISOString() : null };
      const rows = scopes.flatMap(scope_id => active.map(months => {
        const old = selectedRows.get(months);
        return { price: { ...base, scope_id, ...periodPrice(months) }, ...(old ? { id: old.id, expected_version: old.version } : {}) };
      }));
      await pricingApi('/api/v1/admin/prices/matrix', 'POST', { rows, publish: $('price-publish-now').checked });
      closeCreatePriceModal(); showToast(`Đã lưu ${rows.length} bản giá theo kỳ.`, 'success'); await loadPricesList();
    } catch (e) { pricingError('price-error', e); }
    finally { saving = false; button.disabled = false; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('price-periods')?.addEventListener('input', preview);
    $('price-periods')?.addEventListener('focusout', e => { if (e.target.matches('[data-money]')) formatPricingMoney(); });
  });
  window.PageFPTPriceMatrix = { open, save, preview };
})();
