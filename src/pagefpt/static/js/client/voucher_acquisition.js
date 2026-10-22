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

  // ===========================================================================
  // CANVAS FIREWORKS & CONFETTI ENGINE (BÙNG NỔ THỊ GIÁC)
  // ===========================================================================
  function launchFireworks() {
    const canvas = get('voucher-confetti-canvas');
    if (!canvas || typeof canvas.getContext !== 'function' || typeof window.requestAnimationFrame !== 'function') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth || 400;
    canvas.height = window.innerHeight || 700;

    const colors = ['#f26f21', '#ff8b26', '#ef4444', '#fbbf24', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#ffffff'];
    const particles = [];
    const originX = canvas.width / 2;
    const originY = Math.max(120, canvas.height * 0.3);

    for (let i = 0; i < 95; i++) {
      const angle = (Math.PI * 2 * i) / 95 + (Math.random() - 0.5) * 0.4;
      const speed = Math.random() * 12 + 4;
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 4,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 14,
        gravity: 0.24,
        drag: 0.982,
        life: 1.0,
        decay: Math.random() * 0.015 + 0.009,
        isStar: Math.random() > 0.65
      });
    }

    let running = true;
    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = 0;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.life <= 0) continue;
        alive++;

        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.rotation += p.rotSpeed;
        p.life -= p.decay;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;

        if (p.isStar) {
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.3, -p.size * 0.3);
          ctx.lineTo(p.size, 0);
          ctx.lineTo(p.size * 0.3, p.size * 0.3);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.3, p.size * 0.3);
          ctx.lineTo(-p.size, 0);
          ctx.lineTo(-p.size * 0.3, -p.size * 0.3);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        }
        ctx.restore();
      }

      if (alive > 0) {
        window.requestAnimationFrame(draw);
      } else {
        running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    window.requestAnimationFrame(draw);
  }

  // ===========================================================================
  // HOẠT CẢNH: HỘP QUÀ MỞ NẮP ➔ POPUP BAY RA
  // ===========================================================================
  let openTimer = null;
  function triggerGiftSequence() {
    const intro = get('voucher-gift-intro');
    const panel = get('voucher-ticket-panel');
    if (!intro || !panel) return;

    if (openTimer) clearTimeout(openTimer);

    // Khởi tạo trạng thái ban đầu: Hộp quà hiện, Tấm vé ẩn chờ bay ra
    intro.classList.remove('is-hidden', 'is-opening');
    panel.classList.remove('is-revealed');
    panel.classList.add('is-waiting');

    // Sau 550ms: Hộp quà mở nắp và pháo hoa nổ
    openTimer = setTimeout(() => {
      intro.classList.add('is-opening');
      launchFireworks();

      // Sau 250ms tiếp theo: Tấm vé voucher từ lòng hộp quà bay vút ra phóng to
      setTimeout(() => {
        panel.classList.remove('is-waiting');
        panel.classList.add('is-revealed');
        emitAnalytics('view_promotion');
        // Ẩn hộp quà sau khi vé đã bay ra hoàn chỉnh
        setTimeout(() => {
          intro.classList.add('is-hidden');
        }, 400);
      }, 250);
    }, 550);
  }

  const giftBox = get('voucher-gift-box');
  if (giftBox) {
    giftBox.addEventListener('click', () => {
      const intro = get('voucher-gift-intro');
      const panel = get('voucher-ticket-panel');
      if (intro && panel && !intro.classList.contains('is-opening')) {
        if (openTimer) clearTimeout(openTimer);
        intro.classList.add('is-opening');
        launchFireworks();
        emitAnalytics('click_gift_box_manual');
        setTimeout(() => {
          panel.classList.remove('is-waiting');
          panel.classList.add('is-revealed');
          emitAnalytics('view_promotion');
          setTimeout(() => { intro.classList.add('is-hidden'); }, 400);
        }, 200);
      }
    });
  }

  let lastDismissReason = 'unknown';

  // ===========================================================================
  // HỆ THỐNG ĐO LƯỜNG SỰ KIỆN CHUYỂN ĐỔI (GA4 / GTM PROMOTION TRACKING)
  // ===========================================================================
  function emitAnalytics(eventName, extra = {}) {
    const v = current();
    const payload = {
      event: eventName,
      promotion_id: v?.code || 'NO_VOUCHER',
      promotion_name: v?.name || 'Tư vấn ưu đãi',
      creative_name: 'gift_box_popup',
      creative_slot: 'source_modal',
      program_type: v?.program_type || 'cash_discount',
      gift_name: v?.physical_gift?.name || null,
      value_vnd: v?.physical_gift?.market_value_vnd || v?.benefits?.[0]?.amount || 0,
      timestamp: Date.now(),
      ...extra
    };
    if (window.dataLayer && Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, payload);
    }
  }

  // Nút sao chép mã voucher
  const copyBtn = get('voucher-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = get('voucher-acquisition-code')?.textContent;
      if (!code || code === '—' || code === 'Chưa áp dụng') return;
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(code);
        copyBtn.textContent = '✅ Đã chép!';
        emitAnalytics('copy_promotion_code', { promotion_code: code });
        setTimeout(() => { copyBtn.textContent = '📋 Sao chép'; }, 2000);
      } catch (_) {}
    });
  }

  function eligible(v) {
    return !!v && v.status === 'active' && !v.sold_out &&
      !(v.benefits?.length && v.benefits.every(b => b.sold_out === true)) &&
      Date.parse(v.start) <= Date.now() && Date.now() < Date.parse(v.end) &&
      (!marker || v.link?.slug === marker);
  }

  // ===========================================================================
  // TRÍCH XUẤT SỐ TIỀN / QUÀ TẶNG ƯU ĐÃI TO NỔI BẬT (HERO DISCOUNT / GIFT)
  // ===========================================================================
  function updateHeroDiscount(v, valid) {
    const heroBox = get('voucher-hero-discount');
    const heroPrefix = get('voucher-hero-prefix');
    const heroAmount = get('voucher-hero-amount');
    const heroSub = get('voucher-hero-sub');
    const giftWrap = get('voucher-hero-gift-wrap');
    const giftImg = get('voucher-hero-gift-img');
    const giftMarketVal = get('voucher-gift-market-val');
    const giftMarketBox = get('voucher-gift-market-box');
    if (!heroBox || !heroAmount) return;

    if (!valid || !v) {
      if (giftWrap) giftWrap.hidden = true;
      if (heroPrefix) heroPrefix.textContent = 'TƯ VẤN ƯU ĐÃI';
      heroAmount.textContent = 'GÓI CƯỚC TỐT NHẤT';
      if (heroSub) heroSub.textContent = 'Nhân viên sẽ kiểm tra chính sách khuyến mại hiện hành theo địa chỉ của bạn';
      return;
    }

    const cfg = v.popup_config || {};
    const physGift = v.physical_gift;
    const hasPhysGift = !!(physGift && physGift.name);

    // Hiển thị khung quà tặng sản phẩm thật nếu có
    if (giftWrap) {
      if (hasPhysGift && (v.program_type === 'physical_gift' || v.program_type === 'combo_gift_cash')) {
        giftWrap.hidden = false;
        if (giftImg) {
          if (physGift.image_url) {
            giftImg.src = physGift.image_url;
            giftImg.alt = physGift.name;
            giftImg.style.display = 'block';
          } else {
            giftImg.style.display = 'none';
          }
        }
        if (giftMarketBox && giftMarketVal) {
          if (physGift.market_value_vnd && physGift.market_value_vnd > 0) {
            giftMarketVal.textContent = money(physGift.market_value_vnd);
            giftMarketBox.style.display = 'flex';
          } else {
            giftMarketBox.style.display = 'none';
          }
        }
      } else {
        giftWrap.hidden = true;
      }
    }

    // Ưu tiên các trường ghi đè từ popup_config nếu admin đã thiết lập
    if (cfg.hero_prefix) {
      heroPrefix.textContent = cfg.hero_prefix;
    }
    if (cfg.hero_highlight) {
      heroAmount.textContent = cfg.hero_highlight;
    }
    if (cfg.hero_sub) {
      heroSub.textContent = cfg.hero_sub;
    }

    // Nếu admin chưa ghi đè thì tự động nội suy thông minh
    if (!cfg.hero_highlight) {
      if (v.program_type === 'physical_gift' && hasPhysGift) {
        if (!cfg.hero_prefix) heroPrefix.textContent = 'TẶNG HIỆN VẬT';
        heroAmount.textContent = physGift.name.toUpperCase();
        if (!cfg.hero_sub) {
          heroSub.textContent = physGift.condition_note || 'Kèm hợp đồng đăng ký mới';
        }
      } else {
        const b = (v.benefits || [])[0];
        if (!b) {
          if (!cfg.hero_prefix) heroPrefix.textContent = 'ƯU ĐÃI ĐẶC QUYỀN';
          heroAmount.textContent = v.label || 'VOUCHER VIP';
          if (!cfg.hero_sub) heroSub.textContent = 'Áp dụng khi lắp đặt FPT';
        } else {
          const effective = b.discount_kind === 'percent'
            ? b.amount
            : Math.min(b.amount || 0, b.cap_vnd ?? b.amount ?? 0);

          if (b.discount_kind === 'percent' && effective > 0) {
            if (!cfg.hero_prefix) heroPrefix.textContent = 'GIẢM NGAY';
            heroAmount.textContent = `${effective / 100}%`;
            if (!cfg.hero_sub) heroSub.textContent = b.cap_vnd ? `Tối đa ${money(b.cap_vnd)}` : 'Trừ vào chi phí lắp đặt';
          } else if (effective > 0) {
            if (!cfg.hero_prefix) heroPrefix.textContent = 'GIẢM TRỰC TIẾP';
            heroAmount.textContent = money(effective);
            if (!cfg.hero_sub) heroSub.textContent = 'Trừ vào chi phí lắp đặt';
          } else if (b.gift_name) {
            if (!cfg.hero_prefix) heroPrefix.textContent = 'TẶNG THIẾT BỊ';
            heroAmount.textContent = b.gift_name.toUpperCase();
            if (!cfg.hero_sub) heroSub.textContent = 'Kèm hợp đồng đăng ký mới';
          } else {
            if (!cfg.hero_prefix) heroPrefix.textContent = 'ƯU ĐÃI ĐẶC BIỆT';
            heroAmount.textContent = v.label || 'VOUCHER VIP';
            if (!cfg.hero_sub) heroSub.textContent = 'Dành cho khách hàng đăng ký mới';
          }
        }
      }
    }
  }

  function render() {
    const v = current(), valid = eligible(v); state = valid ? v : null;
    const cfg = v?.popup_config || {};

    const eyebrow = get('voucher-acquisition-eyebrow');
    if (eyebrow) {
      eyebrow.textContent = valid ? (cfg.eyebrow || '🎁 ƯU ĐÃI ĐẶC QUYỀN') : '🎁 ƯU ĐÃI KHÁCH HÀNG';
      eyebrow.hidden = (cfg.show_eyebrow === false);
    }

    get('voucher-acquisition-title').textContent = valid
      ? (cfg.title || 'Chúc mừng! Bạn nhận được ưu đãi')
      : 'Cùng tìm ưu đãi phù hợp';

    const labelEl = get('voucher-acquisition-label');
    if (labelEl) {
      labelEl.textContent = valid
        ? (cfg.subtitle || v.name)
        : 'Ưu đãi từ link này hiện chưa sẵn sàng. Bạn vẫn có thể nhận tư vấn gói phù hợp.';
      labelEl.hidden = (cfg.show_subtitle === false) || !labelEl.textContent.trim();
    }

    get('voucher-acquisition-code').textContent = valid ? v.code : 'Chưa áp dụng';
    get('voucher-acquisition-end').textContent = valid ? day(v.end) : 'Nhân viên kiểm tra';
    get('voucher-acquisition-terms').textContent = valid ? v.terms : 'Mã chưa công bố, chưa bắt đầu hoặc đã ngừng không được áp dụng. Nhân viên sẽ kiểm tra ưu đãi đang có theo địa chỉ của bạn.';

    // Nhãn khẩn cấp / khan hiếm (Urgency badge)
    const urgency = get('voucher-urgency-badge');
    if (urgency) {
      if (valid && cfg.urgency_badge && cfg.urgency_badge.trim()) {
        urgency.textContent = cfg.urgency_badge;
        urgency.hidden = false;
      } else {
        urgency.hidden = true;
      }
    }

    // Cập nhật số tiền và quà tặng ưu đãi to nổi bật
    updateHeroDiscount(v, valid);
    const heroBox = get('voucher-hero-discount');
    const giftBox = get('voucher-hero-gift-wrap');
    if (heroBox && cfg.show_hero === false) {
      heroBox.hidden = true;
    }
    if (giftBox && cfg.show_hero === false) {
      giftBox.hidden = true;
    }

    // Perforated line: ẩn nếu không có nội dung nổi bật bên trên
    const perfLine = get('voucher-ticket-perforated');
    if (perfLine) {
      const hasUpper = (heroBox && !heroBox.hidden) || (giftBox && !giftBox.hidden);
      perfLine.hidden = !hasUpper;
    }

    const benefits = get('voucher-acquisition-benefits');
    if (benefits) {
      benefits.replaceChildren();
      if (valid && cfg.show_benefits !== false) {
        if (v.physical_gift?.name) {
          const giftItem = document.createElement('p');
          giftItem.textContent = '🎁 Miễn phí ' + v.physical_gift.name + (v.physical_gift.delivery_type === 'installation' ? ' · Giao tận nhà' : '');
          benefits.append(giftItem);
        }
        for (const b of (v.benefits || []).slice(0, 2)) {
          const pieces = [];
          const effective = b.discount_kind === 'percent' ? b.amount : Math.min(b.amount || 0, b.cap_vnd ?? b.amount ?? 0);
          if (effective > 0 && b.cap_vnd !== 0) pieces.push(b.discount_kind === 'percent' ? `Giảm ${b.amount / 100}%` : 'Giảm ' + money(effective));
          if (b.gift_name) pieces.push('Tặng: ' + b.gift_name);
          if (!pieces.length) continue;
          const basis = {monthly:'cước tháng',initial:'phí ban đầu',setup:'hòa mạng',equipment:'thiết bị'}[b.basis];
          const item = document.createElement('p');
          item.textContent = '✨ ' + pieces.join(' · ') + (basis && b.amount > 0 ? ' (' + basis + ')' : '') + (b.region_name && b.region_name !== 'Toàn quốc' ? ' · ' + b.region_name : '');
          benefits.append(item);
        }
        const note = document.createElement('p');
        note.className = 'voucher-benefit-disclaimer';
        note.textContent = '* Áp dụng theo khu vực & gói cước. Suất có hạn.';
        benefits.append(note);
      }
      benefits.hidden = (cfg.show_benefits === false) || !benefits.children.length;
    }

    // Thẻ coupon mã code
    const couponBox = get('voucher-acquisition-coupon-box');
    if (couponBox) {
      couponBox.hidden = (cfg.show_code_box === false);
    }

    // Điều kiện áp dụng
    const conditionsBox = get('voucher-acquisition-conditions');
    if (conditionsBox) {
      conditionsBox.hidden = (cfg.show_terms === false);
    }

    const useText = get('voucher-acquisition-use-text');
    if (useText) {
      useText.textContent = valid ? (cfg.cta_text || 'NHẬN ƯU ĐÃI NGAY') : 'Nhận tư vấn ngay';
    } else {
      get('voucher-acquisition-use').textContent = valid ? (cfg.cta_text ? cfg.cta_text + ' →' : 'Nhận ưu đãi ngay →') : 'Nhận tư vấn ngay →';
    }

    const reassurance = get('voucher-acquisition-reassurance');
    if (reassurance) {
      reassurance.textContent = valid
        ? (cfg.reassurance_text || '🔒 Tư vấn miễn phí, không cần thanh toán trước.')
        : '🔒 Miễn phí tư vấn lắp đặt.';
      reassurance.hidden = (cfg.show_reassurance === false) || !reassurance.textContent.trim();
    }

    const laterBtn = get('voucher-acquisition-later');
    if (laterBtn) {
      laterBtn.textContent = cfg.dismiss_text || 'Bỏ qua ưu đãi';
      laterBtn.hidden = (cfg.show_dismiss === false);
    }


    get('voucher-acquisition-reminder-label').textContent = valid ? 'Dùng mã ' + v.code : 'Nhận tư vấn ưu đãi';
    const summary = get('form-voucher-summary');
    if (summary) {
      summary.hidden = !valid;
      summary.textContent = valid
        ? '🎁 BẠN ĐÃ NHẬN ĐƯỢC ƯU ĐÃI: Mã ' + v.code + ' (' + v.label + ') · Vui lòng để lại thông tin liên hệ bên dưới để chuyên viên áp dụng ưu đãi ngay cho bạn!'
        : '';
    }
    reminder.hidden = !(marker || v?.link) || completedFor === (v?.id || marker);
  }

  let prevHtmlOverflow = null;
  let prevBodyOverflow = null;

  function lockScroll() {
    if (typeof document === 'undefined') return;
    if (document.documentElement && document.documentElement.style) {
      if (prevHtmlOverflow === null) prevHtmlOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (document.documentElement.classList && typeof document.documentElement.classList.add === 'function') {
        document.documentElement.classList.add('voucher-modal-open');
      }
    }
    if (document.body && document.body.style) {
      if (prevBodyOverflow === null) prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      if (document.body.classList && typeof document.body.classList.add === 'function') {
        document.body.classList.add('voucher-modal-open');
      }
    }
  }

  function unlockScroll() {
    if (typeof document === 'undefined') return;
    if (document.documentElement && document.documentElement.style) {
      document.documentElement.style.overflow = prevHtmlOverflow || '';
      prevHtmlOverflow = null;
      if (document.documentElement.classList && typeof document.documentElement.classList.remove === 'function') {
        document.documentElement.classList.remove('voucher-modal-open');
      }
    }
    if (document.body && document.body.style) {
      document.body.style.overflow = prevBodyOverflow || '';
      prevBodyOverflow = null;
      if (document.body.classList && typeof document.body.classList.remove === 'function') {
        document.body.classList.remove('voucher-modal-open');
      }
    }
  }

  function show() {
    render();
    if (dialog.open) return true;
    if (document.querySelector('dialog[open], .bottom-sheet-backdrop.active')) return false;
    dialog.showModal();
    lockScroll();
    get('voucher-acquisition-use').focus();
    triggerGiftSequence();
    return true;
  }

  dialog.addEventListener('close', () => {
    unlockScroll();
    emitAnalytics('dismiss_promotion', { dismiss_reason: lastDismissReason });
    lastDismissReason = 'unknown';
  });
  dialog.addEventListener('cancel', () => {
    lastDismissReason = 'escape_key';
    unlockScroll();
  });
  get('voucher-acquisition-close').addEventListener('click', () => {
    lastDismissReason = 'close_button';
    dialog.close();
  });
  get('voucher-acquisition-later').addEventListener('click', () => {
    lastDismissReason = 'later_button';
    dialog.close();
  });
  reminder.addEventListener('click', () => {
    emitAnalytics('click_reminder_button');
    show();
  });
  dialog.addEventListener('click', e => {
    if (e.target === dialog) {
      lastDismissReason = 'backdrop_click';
      dialog.close();
    }
  });
  get('voucher-acquisition-use').addEventListener('click', () => {
    emitAnalytics('select_promotion', { target_action: 'open_bottom_sheet' });
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
