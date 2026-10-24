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

  // 7. Floating Chat Popup Widget Controller
  function initChatWidget() {
    var widget = document.getElementById('vt-chat-widget');
    if (!widget) return;

    var toggleBtn = document.getElementById('vt-chat-toggle');
    var minimizeBtn = document.getElementById('vt-chat-minimize');
    var closeSuccessBtn = document.getElementById('vt-chat-close-success');
    var nudgeBubble = document.getElementById('vt-chat-nudge');
    var nudgeCloseBtn = document.getElementById('vt-chat-nudge-close');
    var form = document.getElementById('vt-chat-form');
    var formContainer = document.getElementById('vt-chat-form-container');
    var successCard = document.getElementById('vt-chat-success');
    var errorBox = document.getElementById('vt-chat-error');
    var submitBtn = document.getElementById('vt-chat-submit');

    // Check if user previously dismissed nudge bubble
    try {
      if (sessionStorage.getItem('vt_nudge_closed') === '1' && nudgeBubble) {
        nudgeBubble.classList.add('is-closed');
      }
    } catch (e) {}

    function toggleChat(open) {
      if (typeof open === 'boolean') {
        if (open) widget.classList.add('is-open');
        else widget.classList.remove('is-open');
      } else {
        widget.classList.toggle('is-open');
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function(e) {
        e.preventDefault();
        toggleChat();
      });
    }

    if (nudgeBubble) {
      nudgeBubble.addEventListener('click', function(e) {
        // If clicked on close button, let close handler manage it
        if (e.target && (e.target.id === 'vt-chat-nudge-close' || e.target.closest('#vt-chat-nudge-close'))) {
          return;
        }
        e.preventDefault();
        toggleChat(true);
      });
    }

    if (nudgeCloseBtn) {
      nudgeCloseBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (nudgeBubble) nudgeBubble.classList.add('is-closed');
        try {
          sessionStorage.setItem('vt_nudge_closed', '1');
        } catch (err) {}
      });
    }

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        toggleChat(false);
      });
    }

    if (closeSuccessBtn) {
      closeSuccessBtn.addEventListener('click', function(e) {
        e.preventDefault();
        toggleChat(false);
      });
    }

    if (form) {
      form.addEventListener('submit', async function(e) {
        e.preventDefault();
        var nameInput = document.getElementById('vt-chat-name');
        var phoneInput = document.getElementById('vt-chat-phone');
        var addressInput = document.getElementById('vt-chat-address');
        var messageInput = document.getElementById('vt-chat-message');

        var phone = normalizePhone(phoneInput ? phoneInput.value : '');
        if (!isValidPhone(phone)) {
          if (errorBox) {
            errorBox.textContent = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số).';
            errorBox.style.display = 'block';
          }
          if (phoneInput) phoneInput.focus();
          return;
        }

        var rawName = (nameInput ? nameInput.value : '').trim();
        var address = (addressInput ? addressInput.value : '').trim();
        var message = (messageInput ? messageInput.value : '').trim();
        var vtCfg = window.VT_CONFIG || {};
        var advisorName = vtCfg.advisor_name || 'Hồng FPT';

        var utm = getStoredUtm();
        var utmList = [];
        for (var k in utm) {
          if (utm[k]) utmList.push(k + '=' + utm[k]);
        }

        var noteSegments = [];
        noteSegments.push('[Tư vấn trực tuyến: ' + advisorName + ']');
        if (message) noteSegments.push('Nội dung: ' + message);
        noteSegments.push('Nguồn: ' + window.location.hostname);
        noteSegments.push('Thiết bị: ' + detectDevice());
        if (utmList.length > 0) noteSegments.push('UTM: ' + utmList.join('&'));

        var payload = {
          phone: phone,
          name: rawName,
          installation_address: address,
          notes: noteSegments.join(' | '),
          measurement_path: '/vungtau',
          consent_version: '2026.1'
        };

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Đang gửi...';
        }
        if (errorBox) errorBox.style.display = 'none';

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

          // Show success
          if (formContainer) formContainer.style.display = 'none';
          if (successCard) successCard.style.display = 'block';
          form.reset();

          // Fire Google Ads & Meta Pixel conversion tracking if configured
          try {
            if (typeof window.gtag === 'function') {
              if (vtCfg.google_ads_conversion) {
                var sendTo = vtCfg.google_ads_conversion.indexOf('/') !== -1
                  ? vtCfg.google_ads_conversion
                  : (vtCfg.google_ads_id ? vtCfg.google_ads_id + '/' + vtCfg.google_ads_conversion : vtCfg.google_ads_conversion);
                window.gtag('event', 'conversion', { 'send_to': sendTo });
              }
              window.gtag('event', 'generate_lead', {
                event_category: 'chat_form',
                event_label: 'Chat Lead - ' + advisorName
              });
            }
            if (typeof window.fbq === 'function') {
              window.fbq('track', 'Lead', {
                content_name: 'Chat Lead - ' + advisorName
              });
            }
          } catch (trackErr) {
            console.warn('Tracking dispatch error:', trackErr);
          }
        } catch (err) {
          if (errorBox) {
            errorBox.textContent = err.message || 'Lỗi gửi tin. Quý khách vui lòng gọi Hotline để được tư vấn nhanh nhất!';
            errorBox.style.display = 'block';
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Bắt đầu';
          }
        }
      });
    }
  }

  // 8. Hero Quick Lead Form Controller (1-step lead generation)
  function initQuickHeroForm() {
    var quickForm = document.getElementById('vt-quick-hero-form');
    if (!quickForm) return;

    quickForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var phoneInput = document.getElementById('vt-quick-phone');
      var planSelect = document.getElementById('vt-quick-plan');
      var submitBtn = document.getElementById('vt-quick-btn');
      var feedback = document.getElementById('vt-quick-feedback');

      var phone = normalizePhone(phoneInput ? phoneInput.value : '');
      if (!isValidPhone(phone)) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = '#fee2e2';
          feedback.style.color = '#b91c1c';
          feedback.textContent = 'Vui lòng nhập số điện thoại Việt Nam hợp lệ (10 chữ số).';
        }
        if (phoneInput) phoneInput.focus();
        return;
      }

      var selectedPlan = planSelect ? planSelect.value : 'Tư vấn gói cước phù hợp';
      var utm = getStoredUtm();
      var utmList = [];
      for (var k in utm) {
        if (utm[k]) utmList.push(k + '=' + utm[k]);
      }

      var noteSegments = [
        'Gói quan tâm: ' + selectedPlan,
        'Form: Đăng ký nhanh đầu trang (Hero Quick Form)',
        'Nguồn: ' + window.location.hostname,
        'Thiết bị: ' + detectDevice()
      ];
      if (utmList.length > 0) noteSegments.push('UTM: ' + utmList.join('&'));

      var payload = {
        phone: phone,
        name: 'Khách hàng đăng ký nhanh',
        installation_address: 'Bà Rịa - Vũng Tàu',
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

        // Show inline feedback
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = '#dcfce7';
          feedback.style.color = '#15803d';
          feedback.innerHTML = '🎉 <strong>Đăng ký thành công!</strong> Chuyên viên FPT Vũng Tàu sẽ liên hệ lại hỗ trợ quý khách trong ít phút.';
        }
        quickForm.reset();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'ĐÃ GỬI THÀNH CÔNG ✓';
          setTimeout(function() { submitBtn.textContent = 'GỬI YÊU CẦU NGAY'; }, 5000);
        }

        // Fire Google Ads & Meta Pixel conversion tracking
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
              event_category: 'hero_quick_form',
              event_label: 'Hero Quick Form - ' + selectedPlan
            });
          }
          if (typeof window.fbq === 'function') {
            window.fbq('track', 'Lead', {
              content_name: 'Hero Quick Form - ' + selectedPlan
            });
          }
        } catch (trackErr) {
          console.warn('Tracking dispatch error:', trackErr);
        }

      } catch (err) {
        if (feedback) {
          feedback.style.display = 'block';
          feedback.style.background = '#fee2e2';
          feedback.style.color = '#b91c1c';
          feedback.textContent = err.message || 'Lỗi gửi tin. Quý khách vui lòng gọi Hotline để được hỗ trợ nhanh nhất!';
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'THỬ LẠI';
        }
      }
    });
  }

  // Initialize on DOM ready
  initAttribution();
  function initAll() {
    initLeadModal();
    initChatWidget();
    initQuickHeroForm();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();


