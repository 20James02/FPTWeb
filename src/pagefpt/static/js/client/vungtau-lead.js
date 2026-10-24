/**
 * FPT Vũng Tàu - Lead Capture & Marketing Parameter Algorithms
 * Automatically handles UTM attribution, device classification, contextual plan selection,
 * and reliable asynchronous submission to /api/v1/leads without affecting the main site.
 */
(function() {
  'use strict';

  // 1. UUID Generator for Idempotency
  function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // 2. UTM Attribution Storage Algorithm
  function initAttribution() {
    try {
      var params = new URLSearchParams(window.location.search);
      var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      var currentUtm = {};
      var hasUtm = false;

      utmKeys.forEach(function(k) {
        var v = params.get(k);
        if (v) {
          currentUtm[k] = v;
          hasUtm = true;
        }
      });

      if (hasUtm) {
        sessionStorage.setItem('vt_utm_params', JSON.stringify(currentUtm));
      }
    } catch (e) {
      // sessionStorage unavailable
    }
  }

  function getStoredUtm() {
    try {
      var stored = sessionStorage.getItem('vt_utm_params');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  // 3. Device Classification Algorithm
  function detectDevice() {
    var ua = navigator.userAgent || '';
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) || window.innerWidth < 768;
    if (isMobile) return 'Mobile';
    if (window.innerWidth < 1024) return 'Tablet';
    return 'Desktop';
  }

  // 4. Vietnamese Phone Normalization & Validation
  function normalizePhone(phone) {
    if (!phone) return '';
    var clean = phone.replace(/[ .()-]/g, '');
    if (clean.startsWith('+84')) clean = '0' + clean.slice(3);
    else if (clean.startsWith('84') && clean.length > 9) clean = '0' + clean.slice(2);
    return clean;
  }

  function isValidPhone(phone) {
    var p = normalizePhone(phone);
    return /^0[35789]\d{8}$/.test(p) || /^1[89]00\d{4,6}$/.test(p);
  }

  // 5. Contextual Plan Detection Algorithm
  function detectPlanNameFromElement(el) {
    if (!el) return '';
    var container = el.closest('.product-small, .box, .col, .tab-panel, .ux-shape-divider, section, tr');
    if (!container) return '';
    var heading = container.querySelector('h1, h2, h3, h4, .product-title, .woocommerce-loop-product__title, strong');
    if (heading && heading.textContent) {
      var txt = heading.textContent.trim().replace(/\s+/g, ' ');
      if (txt.length > 2 && txt.length < 80) return txt;
    }
    return '';
  }

  // 6. Modal Controller
  function initLeadModal() {
    var modal = document.getElementById('vt-lead-modal');
    if (!modal) return;

    var backdrop = modal.querySelector('.vt-modal-backdrop');
    var closeBtn = modal.querySelector('.vt-modal-close');
    var form = document.getElementById('vt-lead-form');
    var planSelect = document.getElementById('vt-plan-select');
    var successView = document.getElementById('vt-lead-success');
    var errorView = document.getElementById('vt-lead-error');
    var submitBtn = document.getElementById('vt-lead-submit-btn');

    function openModal(planName) {
      if (planSelect && planName) {
        var found = false;
        for (var i = 0; i < planSelect.options.length; i++) {
          if (planSelect.options[i].text.toLowerCase().includes(planName.toLowerCase()) ||
              planName.toLowerCase().includes(planSelect.options[i].text.toLowerCase())) {
            planSelect.selectedIndex = i;
            found = true;
            break;
          }
        }
        if (!found && planName) {
          var opt = document.createElement('option');
          opt.value = planName;
          opt.textContent = planName;
          opt.selected = true;
          planSelect.appendChild(opt);
        }
      }
      if (successView) successView.style.display = 'none';
      if (errorView) errorView.style.display = 'none';
      if (form) {
        form.style.display = 'block';
      }
      modal.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      var phoneInput = document.getElementById('vt-input-phone');
      if (phoneInput) setTimeout(function() { phoneInput.focus(); }, 100);
    }

    function closeModal() {
      modal.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    // Expose global opener
    window.openVungTauLeadModal = openModal;

    // Listen to all registration clicks
    document.addEventListener('click', function(e) {
      var target = e.target.closest('a, button');
      if (!target) return;

      var href = (target.getAttribute('href') || '').toLowerCase();
      var text = (target.textContent || '').trim().toLowerCase();
      var isRegAction = href.includes('dang-ky-thong-tin') ||
                        href.includes('#dang-ky') ||
                        target.classList.contains('btn-dang-ky') ||
                        target.classList.contains('button-nha') ||
                        text.includes('đăng ký online') ||
                        text === 'đăng ký' ||
                        text === 'chọn gói' ||
                        text === 'nhận tư vấn';

      if (isRegAction) {
        e.preventDefault();
        var planName = detectPlanNameFromElement(target);
        openModal(planName);
      }
    });

    // Handle Form Submit
    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var phoneInput = document.getElementById('vt-input-phone');
        var nameInput = document.getElementById('vt-input-name');
        var addressInput = document.getElementById('vt-input-address');
        var notesInput = document.getElementById('vt-input-notes');
        var genderInputs = document.getElementsByName('vt-gender');

        var phone = normalizePhone(phoneInput ? phoneInput.value : '');
        if (!isValidPhone(phone)) {
          alert('Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số).');
          if (phoneInput) phoneInput.focus();
          return;
        }

        var gender = 'Anh';
        for (var i = 0; i < genderInputs.length; i++) {
          if (genderInputs[i].checked) {
            gender = genderInputs[i].value;
            break;
          }
        }

        var rawName = (nameInput ? nameInput.value : '').trim();
        var fullName = rawName ? gender + ' ' + rawName : gender;
        var address = (addressInput ? addressInput.value : '').trim();
        var customNotes = (notesInput ? notesInput.value : '').trim();
        var selectedPlan = planSelect ? planSelect.value : '';

        var utm = getStoredUtm();
        var utmList = [];
        for (var k in utm) {
          if (utm[k]) utmList.push(k + '=' + utm[k]);
        }

        var noteSegments = [];
        if (selectedPlan) noteSegments.push('Gói cước: ' + selectedPlan);
        if (customNotes) noteSegments.push('Lời nhắn: ' + customNotes);
        noteSegments.push('Nguồn: ' + window.location.hostname);
        noteSegments.push('Thiết bị: ' + detectDevice());
        if (utmList.length > 0) noteSegments.push('UTM: ' + utmList.join('&'));

        var payload = {
          phone: phone,
          name: fullName,
          installation_address: address,
          notes: noteSegments.join(' | '),
          measurement_path: '/vungtau',
          consent_version: '2026.1'
        };

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Đang gửi thông tin...';
        }

        try {
          var response = await fetch('/api/v1/leads', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': generateUUID()
            },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            var errData = await response.json().catch(function() { return {}; });
            throw new Error(errData.detail || 'Không thể gửi đăng ký lúc này.');
          }

          // Success
          form.style.display = 'none';
          if (successView) successView.style.display = 'block';
          form.reset();

          // Fire Google Ads & Meta Pixel conversion tracking if configured
          try {
            var vtCfg = window.VT_CONFIG || {};
            if (typeof window.gtag === 'function') {
              if (vtCfg.google_ads_conversion) {
                var sendTo = vtCfg.google_ads_conversion.indexOf('/') !== -1
                  ? vtCfg.google_ads_conversion
                  : (vtCfg.google_ads_id ? vtCfg.google_ads_id + '/' + vtCfg.google_ads_conversion : vtCfg.google_ads_conversion);
                window.gtag('event', 'conversion', { 'send_to': sendTo });
              }
              window.gtag('event', 'generate_lead', {
                event_category: 'form',
                event_label: selectedPlan || 'General Lead'
              });
            }
            if (typeof window.fbq === 'function') {
              window.fbq('track', 'Lead', {
                content_name: selectedPlan || 'General Lead'
              });
            }
          } catch (trackErr) {
            console.warn('Tracking event dispatch warning:', trackErr);
          }
        } catch (err) {
          if (errorView) {
            errorView.textContent = err.message || 'Đã có lỗi xảy ra. Quý khách vui lòng gọi Hotline để được hỗ trợ nhanh nhất!';
            errorView.style.display = 'block';
          } else {
            alert(err.message || 'Đã có lỗi xảy ra. Vui lòng thử lại!');
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'ĐĂNG KÝ TƯ VẤN NGAY';
          }
        }
      });
    }
  }

  // Initialize on DOM ready
  initAttribution();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeadModal);
  } else {
    initLeadModal();
  }
})();
