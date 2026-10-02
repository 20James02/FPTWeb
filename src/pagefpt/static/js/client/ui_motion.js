/**
 * PAGEFPT UI MOTION & ANIMATION ORCHESTRATOR
 * Integrates:
 * - Lenis (Smooth Momentum Scrolling & Anchor Navigation)
 * - AOS (Scroll Reveal Stagger Animations)
 * - Vanilla-Tilt (3D Parallax & Micro-interactions)
 * - Canvas Confetti (Celebratory High-Impact Micro-interaction)
 * - Dynamic Number Counter on Scroll Reveal
 */

(function () {
  'use strict';

  // 1. LENIS SMOOTH SCROLLING
  if (typeof Lenis !== 'undefined') {
    try {
      const lenis = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
        infinite: false,
      });

      window.lenis = lenis;

      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      // Smooth scroll for in-page anchor links
      document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href || href === '#' || href.startsWith('#!')) return;

        const targetEl = document.querySelector(href);
        if (targetEl) {
          e.preventDefault();
          lenis.scrollTo(targetEl, {
            offset: -75,
            duration: 1.1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          });
        }
      });

      // Keep AOS in sync with Lenis smooth scroll
      lenis.on('scroll', () => {
        if (window.AOS) {
          window.AOS.refresh();
        }
      });
    } catch (err) {
      console.warn('Lenis initialization skipped:', err);
    }
  }

  // 2. AOS (ANIMATE ON SCROLL)
  if (typeof AOS !== 'undefined') {
    try {
      AOS.init({
        duration: 650,
        easing: 'ease-out-cubic',
        once: true,
        offset: 50,
        delay: 50,
        disableMutationObserver: false,
      });
    } catch (err) {
      console.warn('AOS init skipped:', err);
    }
  }

  // 3. VANILLA-TILT (3D TACTILE HOVER)
  function initTiltEffects() {
    if (typeof VanillaTilt === 'undefined') return;

    // Only apply tilt on pointer/mouse devices for best UX
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      try {
        const tiltElements = document.querySelectorAll(
          '.quick-utility-item, .promo-card, .ecosystem-card, .process-card, .trust-metric-card'
        );
        if (tiltElements.length) {
          VanillaTilt.init(tiltElements, {
            max: 7,
            speed: 400,
            glare: true,
            'max-glare': 0.12,
            scale: 1.02,
            perspective: 1000,
          });
        }
      } catch (err) {
        console.warn('VanillaTilt init skipped:', err);
      }
    }
  }

  // 4. CANVAS CONFETTI CELEBRATION HELPER
  window.fireConfettiCelebration = function (customOpts = {}) {
    if (typeof confetti === 'function') {
      try {
        const defaults = {
          particleCount: 90,
          spread: 75,
          origin: { y: 0.62 },
          colors: ['#F26F21', '#00A3FF', '#10B981', '#F59E0B', '#7C3AED'],
          zIndex: 9999,
        };
        confetti({ ...defaults, ...customOpts });

        // Stagger second burst for premium fireworks feel
        setTimeout(() => {
          confetti({
            particleCount: 45,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#F26F21', '#00A3FF', '#F59E0B'],
            zIndex: 9999,
          });
          confetti({
            particleCount: 45,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#10B981', '#7C3AED', '#F26F21'],
            zIndex: 9999,
          });
        }, 220);
      } catch (err) {
        console.warn('Confetti burst error:', err);
      }
    }
  };

  // 5. INTERSECTION OBSERVER NUMBER COUNTER
  function initCounterObserver() {
    const counterElements = document.querySelectorAll('[data-counter-val]');
    if (!counterElements.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.getAttribute('data-counter-val')) || 0;
          const suffix = el.getAttribute('data-counter-suffix') || '';
          const prefix = el.getAttribute('data-counter-prefix') || '';
          const duration = 1200;
          const startTime = performance.now();

          function updateCounter(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quad
            const easeVal = progress * (2 - progress);
            const current = Math.floor(easeVal * target);
            el.textContent = `${prefix}${current.toLocaleString('vi-VN')}${suffix}`;

            if (progress < 1) {
              requestAnimationFrame(updateCounter);
            } else {
              el.textContent = `${prefix}${target.toLocaleString('vi-VN')}${suffix}`;
            }
          }
          requestAnimationFrame(updateCounter);
          obs.unobserve(el);
        }
      });
    }, { threshold: 0.3 });

    counterElements.forEach(el => observer.observe(el));
  }

  // =================================================================
  // 6. RUNLINE PROMO MARQUEE & DYNAMIC DATE
  // =================================================================
  function initRunlineDate() {
    const dateEl = document.getElementById('runline-today-date');
    if (!dateEl) return;

    const now = new Date();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();

    const formattedDate = `${dayName}, ${dd}/${mm}/${yyyy}`;
    dateEl.textContent = formattedDate;

    // Seamless duplication of marquee content for smooth infinite looping
    const marqueeTrack = document.getElementById('runline-marquee-text');
    if (marqueeTrack && !marqueeTrack.dataset.duplicated) {
      marqueeTrack.innerHTML = marqueeTrack.innerHTML + marqueeTrack.innerHTML;
      marqueeTrack.dataset.duplicated = 'true';
    }
  }

  window.toggleRunlinePlayPause = function () {
    const bar = document.getElementById('promo-runline-bar');
    const btn = document.getElementById('btn-runline-pause');
    if (!bar || !btn) return;

    const isPaused = bar.classList.toggle('is-paused');
    const pauseIcon = btn.querySelector('.icon-pause');
    const playIcon = btn.querySelector('.icon-play');

    if (pauseIcon && playIcon) {
      if (isPaused) {
        pauseIcon.style.display = 'none';
        playIcon.style.display = 'inline';
        btn.setAttribute('title', 'Tiếp tục chạy chữ');
      } else {
        pauseIcon.style.display = 'inline';
        playIcon.style.display = 'none';
        btn.setAttribute('title', 'Tạm dừng chạy chữ');
      }
    }
  };

  // =================================================================
  // 7. ADMIN-CONTROLLED SYSTEM DISPLAY SETTINGS
  // (Tất cả thiết lập hiển thị đều do Admin cấu hình, người dùng không thể can thiệp)
  // =================================================================
  async function loadAndApplyAdminDisplaySettings() {
    let settings = {
      fpt_anim: true,
      fpt_anim_style: 'wave',
      runline_enabled: true,
      runline_speed: 'normal',
      lenis_scroll: true,
      tilt_parallax: true,
      banner_zones: {
        hero_slider: true,
        showcase_posters: true,
        ribbon_banner: true,
        promo_grid: true,
        app_banner: true,
        floating_promo: true
      }
    };

    try {
      const res = await fetch('/api/v1/system/display-settings');
      if (res.ok) {
        const data = await res.json();
        settings = { ...settings, ...data };
      }
    } catch (_) {
      // Fallback to default admin configuration if offline
    }

    applySystemDisplaySettings(settings);
  }

  function applySystemDisplaySettings(settings) {
    // 1. FPT Logo Letter Animation
    const fptBadges = document.querySelectorAll('.fpt-animated-badge');
    fptBadges.forEach(badge => {
      badge.classList.remove('fpt-anim-disabled', 'fpt-anim-wave', 'fpt-anim-bounce', 'fpt-anim-glow');
      if (!settings.fpt_anim) {
        badge.classList.add('fpt-anim-disabled');
      } else {
        badge.classList.add(`fpt-anim-${settings.fpt_anim_style || 'wave'}`);
      }
    });

    // 2. Runline Bar Visibility & Speed
    const runlineBar = document.getElementById('promo-runline-bar');
    if (runlineBar) {
      if (settings.runline_enabled) {
        runlineBar.classList.remove('is-hidden');
      } else {
        runlineBar.classList.add('is-hidden');
      }

      const speedMap = { slow: '42s', normal: '28s', fast: '16s' };
      const duration = speedMap[settings.runline_speed] || '28s';
      document.documentElement.style.setProperty('--runline-duration', duration);

      if (settings.runline_text && settings.runline_text.trim()) {
        const marqueeEl = document.getElementById('runline-marquee-text');
        if (marqueeEl) {
          const parts = settings.runline_text.split('•').map(p => p.trim()).filter(Boolean);
          if (parts.length > 0) {
            const nodes=[];
            parts.forEach((part,index)=>{
              if(index) {
                const divider=document.createElement('span');
                divider.className='marquee-divider';divider.textContent='•';nodes.push(divider);
              }
              const item=document.createElement('span');
              item.className='marquee-item';item.textContent=part;nodes.push(item);
            });
            marqueeEl.replaceChildren(...nodes);
          }
        }
      }
    }

    // 3. Lenis Smooth Scroll
    if (window.lenis) {
      if (settings.lenis_scroll) {
        window.lenis.start();
      } else {
        window.lenis.stop();
      }
    }

    // 4. Banner & Poster Zones (Show/Hide per Admin configuration)
    if (settings.banner_zones) {
      const zonesMap = {
        hero_slider: '.hero-carousel-section',
        showcase_posters: '#showcase-banners-section',
        ribbon_banner: '#ribbon-banner-section',
        promo_grid: '#promotions-section',
        app_banner: '#app-banner-section',
        floating_promo: '#floating-promo-widget'
      };

      Object.entries(zonesMap).forEach(([zoneKey, selector]) => {
        const el = document.querySelector(selector);
        if (el) {
          if (settings.banner_zones[zoneKey] === false) {
            el.style.display = 'none';
          } else {
            el.style.display = '';
          }
        }
      });
    }
  }

  window.applySystemDisplaySettings = applySystemDisplaySettings;

  // =================================================================
  // 8. FLASH DEAL COUNTDOWN TIMER (RIBBON BANNER)
  // =================================================================
  function initFlashDealCountdown() {
    const hEl = document.getElementById('flash-hours');
    const mEl = document.getElementById('flash-minutes');
    const sEl = document.getElementById('flash-seconds');
    if (!hEl || !mEl || !sEl) return;

    function updateTimer() {
      const now = new Date();
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      const diff = Math.max(0, Math.floor((endOfDay - now) / 1000));

      const hours = String(Math.floor(diff / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const seconds = String(diff % 60).padStart(2, '0');

      hEl.textContent = hours;
      mEl.textContent = minutes;
      sEl.textContent = seconds;
    }

    updateTimer();
    setInterval(updateTimer, 1000);
  }

  // DOM Content Loaded Handler
  function initAllMotionFeatures() {
    initTiltEffects();
    initCounterObserver();
    initRunlineDate();
    initFlashDealCountdown();
    loadAndApplyAdminDisplaySettings();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllMotionFeatures);
  } else {
    initAllMotionFeatures();
  }
})();
