/**
 * PAGEFPT 3D PLANS SLIDER & MULTITASKING CONTROLLER
 * - Displays ONLY 3 primary cards simultaneously (Left, Center, Right) in 3D Multitask Mode
 * - Zoom-in effect for the active Center card (scale 1.08, elevated z-index, brand shadow)
 * - Light sheen sweep ("lướt sáng") animation across the face on transition
 * - 3D 180° Flip Card inspection (Front & Back technical specifications)
 */

let currentMultitaskIndex = 0; // Start with the first published package.
let isMultitaskAnimating = false;

/**
 * 3D Card Flip (Front / Back)
 */
function flipPlanCard(cardId) {
  const cardInner = document.getElementById(cardId);
  if (!cardInner) return;

  const isFlipped = cardInner.classList.toggle('flipped');

  if (typeof trackEvent === 'function') {
    trackEvent('flip_plan_card_3d', { cardId, isFlipped });
  }
}

/**
 * Render the 3-Card Multitask State
 * Only 3 cards are visible: Left (prev), Center (active / zoomed-in), Right (next)
 * All other cards are hidden (is-hidden).
 */
function renderMultitaskState(triggerShine = true) {
  const track = document.getElementById('plans-slider-track');
  const stage = document.getElementById('plans-3d-stage');
  const controls = document.getElementById('plans-slider-controls');
  const dotsContainer = document.getElementById('plans-slider-dots');
  if (!track || !stage) return;

  // Filter cards matching current category filter
  const allCards = Array.from(track.querySelectorAll('.plan-card-3d-wrapper'));
  const activeCategoryCards = allCards.filter(card => card.dataset.categoryHidden !== 'true');
  const count = activeCategoryCards.length;

  allCards.filter(card=>card.dataset.categoryHidden === 'true').forEach(card=>{
    card.classList.remove('is-center','is-prev','is-next','sweep-light');
    card.classList.add('is-hidden');
    card.style.display='none';
    card.removeAttribute('aria-current');
    card.onclick=null;
  });
  if (count === 0) {
    if (controls) controls.style.display='none';
    if (dotsContainer) dotsContainer.innerHTML='';
    return;
  }

  // Clamp current index
  if (currentMultitaskIndex >= count) {
    currentMultitaskIndex = count - 1;
  }
  if (currentMultitaskIndex < 0) {
    currentMultitaskIndex = 0;
  }

  const isCompact = window.innerWidth < 1100;

  // Mobile and tablet display center active card with peeking adjacent cards
  if (isCompact) {
    stage.classList.add('slider-active-3d', 'multitask-mode', 'mobile-peek-mode');
    stage.classList.remove('mobile-single-card-mode');
    if (controls) controls.style.display = 'flex';

    const centerIdx = currentMultitaskIndex;
    const prevIdx = (centerIdx - 1 + count) % count;
    const nextIdx = (centerIdx + 1) % count;

    activeCategoryCards.forEach((card, idx) => {
      card.classList.remove('is-center', 'is-prev', 'is-next', 'is-hidden', 'sweep-light');
      card.style.order = '';

      if (idx === centerIdx) {
        card.classList.add('is-center');
        card.style.display = 'flex';
        card.setAttribute('aria-current', 'true');
        card.style.order = '2';
        card.onclick = null;

        if (triggerShine) {
          card.classList.add('sweep-light');
          setTimeout(() => {
            card.classList.remove('sweep-light');
          }, 800);
        }
      } else if (idx === prevIdx && count > 1) {
        card.classList.add('is-prev');
        card.style.display = 'flex';
        card.removeAttribute('aria-current');
        card.style.order = '1';
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
        card.onclick = (e) => {
          if (!e.target.closest('button') && !e.target.closest('a')) {
            slidePlansPrev();
          }
        };
      } else if (idx === nextIdx && count > 1) {
        card.classList.add('is-next');
        card.style.display = 'flex';
        card.removeAttribute('aria-current');
        card.style.order = '3';
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
        card.onclick = (e) => {
          if (!e.target.closest('button') && !e.target.closest('a')) {
            slidePlansNext();
          }
        };
      } else {
        card.classList.add('is-hidden');
        card.style.display = 'none';
        card.removeAttribute('aria-current');
        card.onclick = null;
        card.style.order = '99';
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
      }
    });
  } else if (count > 3) {
    // When plans count > 3 on Desktop, engage 3D Multitask Carousel (Strictly 3 cards visible)
    stage.classList.add('slider-active-3d', 'multitask-mode');
    stage.classList.remove('mobile-single-card-mode');
    if (controls) controls.style.display = 'flex';

    // Calculate circular indices for Left, Center, Right
    const centerIdx = currentMultitaskIndex;
    const prevIdx = (centerIdx - 1 + count) % count;
    const nextIdx = (centerIdx + 1) % count;

    activeCategoryCards.forEach((card, idx) => {
      // Clean previous classes
      card.classList.remove('is-center', 'is-prev', 'is-next', 'is-hidden', 'sweep-light');
      card.style.display = '';

      if (idx === centerIdx) {
        card.classList.add('is-center');
        card.setAttribute('aria-current', 'true');
        card.onclick = null; // center card is active

        if (triggerShine) {
          // Trigger light sheen sweep animation
          card.classList.add('sweep-light');
          setTimeout(() => {
            card.classList.remove('sweep-light');
          }, 1000);
        }
      } else if (idx === prevIdx) {
        card.classList.add('is-prev');
        card.removeAttribute('aria-current');
        // Reset 3D flip on side card so it smoothly shows front face
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
        // Clicking left card brings it to center
        card.onclick = (e) => {
          if (!e.target.closest('button') && !e.target.closest('a')) {
            slidePlansPrev();
          }
        };
      } else if (idx === nextIdx) {
        card.classList.add('is-next');
        card.removeAttribute('aria-current');
        // Reset 3D flip on side card so it smoothly shows front face
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
        // Clicking right card brings it to center
        card.onclick = (e) => {
          if (!e.target.closest('button') && !e.target.closest('a')) {
            slidePlansNext();
          }
        };
      } else {
        // Any other cards are strictly hidden -> "chỉ hiển thị 3 thẻ chính"
        card.classList.add('is-hidden');
        card.removeAttribute('aria-current');
        card.onclick = null;
        card.style.order = '99';
        const inner = card.querySelector('.plan-card-3d-inner');
        if (inner) inner.classList.remove('flipped');
      }
    });

    // Set visual order so cards animate seamlessly: Left (1) -> Center (2) -> Right (3)
    const prevCard = activeCategoryCards[prevIdx];
    const centerCard = activeCategoryCards[centerIdx];
    const nextCard = activeCategoryCards[nextIdx];

    if (prevCard && centerCard && nextCard) {
      prevCard.style.order = '1';
      centerCard.style.order = '2';
      nextCard.style.order = '3';
    }
  } else {
    // When <= 3 cards on Desktop, display in standard centered row
    stage.classList.remove('slider-active-3d', 'multitask-mode', 'mobile-single-card-mode');
    if (controls) controls.style.display = 'none';

    activeCategoryCards.forEach((card, idx) => {
      card.style.order = '';
      card.style.display = '';
      card.classList.remove('is-prev', 'is-next', 'is-hidden', 'sweep-light');
      card.onclick = null;
      // Center the middle one if 3 cards
      if (count === 3 && idx === 1) {
        card.classList.add('is-center');
      } else {
        card.classList.remove('is-center');
      }
    });
  }

  // Update dots indicator
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `plans-dot ${i === currentMultitaskIndex ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Xem gói thứ ${i + 1}`);
      dot.onclick = () => goToPlanSlide(i);
      dotsContainer.appendChild(dot);
    }
  }
}

/**
 * Slide to Previous Multitask Card
 */
function slidePlansPrev() {
  const track = document.getElementById('plans-slider-track');
  if (!track || isMultitaskAnimating) return;

  const allCards = Array.from(track.querySelectorAll('.plan-card-3d-wrapper'));
  const activeCards = allCards.filter(c => c.dataset.categoryHidden !== 'true');
  const count = activeCards.length;
  if (count <= 1) return;

  isMultitaskAnimating = true;
  currentMultitaskIndex = (currentMultitaskIndex - 1 + count) % count;

  if (track.classList) {
    track.classList.remove('sliding-next', 'sliding-prev');
    track.classList.add('sliding-prev');
  }
  renderMultitaskState(true);

  setTimeout(() => {
    if (track.classList) track.classList.remove('sliding-prev');
    isMultitaskAnimating = false;
  }, 380);

  if (typeof trackEvent === 'function') {
    trackEvent('slide_multitask_prev', { newIndex: currentMultitaskIndex });
  }
}

/**
 * Slide to Next Multitask Card
 */
function slidePlansNext() {
  const track = document.getElementById('plans-slider-track');
  if (!track || isMultitaskAnimating) return;

  const allCards = Array.from(track.querySelectorAll('.plan-card-3d-wrapper'));
  const activeCards = allCards.filter(c => c.dataset.categoryHidden !== 'true');
  const count = activeCards.length;
  if (count <= 1) return;

  isMultitaskAnimating = true;
  currentMultitaskIndex = (currentMultitaskIndex + 1) % count;

  if (track.classList) {
    track.classList.remove('sliding-next', 'sliding-prev');
    track.classList.add('sliding-next');
  }
  renderMultitaskState(true);

  setTimeout(() => {
    if (track.classList) track.classList.remove('sliding-next');
    isMultitaskAnimating = false;
  }, 380);

  if (typeof trackEvent === 'function') {
    trackEvent('slide_multitask_next', { newIndex: currentMultitaskIndex });
  }
}

/**
 * Jump to Specific Slide by index
 */
function goToPlanSlide(index) {
  currentMultitaskIndex = index;
  renderMultitaskState(true);
}

/**
 * Update 3D Multitask Mode (called when filter changes or on load)
 */
function updatePlans3DMode() {
  renderMultitaskState(true);
}

// Touch swipe and mouse drag gesture support
document.addEventListener('DOMContentLoaded', () => {
  const track = document.getElementById('plans-slider-track');
  if (!track) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let mouseStartX = 0;
  let isMouseDown = false;

  // Touch gestures (Mobile)
  track.addEventListener('touchstart', (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      touchStartX = e.changedTouches[0].screenX;
      touchStartY = e.changedTouches[0].screenY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
    }
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
    }
  }, { passive: true });

  track.addEventListener('touchend', (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      touchEndX = e.changedTouches[0].screenX;
      touchEndY = e.changedTouches[0].screenY;
      handleSwipeGesture();
    }
  }, { passive: true });

  function handleSwipeGesture() {
    const diffX = touchStartX - touchEndX;
    const diffY = touchStartY - touchEndY;
    // Dominant horizontal swipe (> 35px, and horizontal > 1.2x vertical)
    if (Math.abs(diffX) > 35 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
      if (diffX > 0) {
        slidePlansNext();
      } else {
        slidePlansPrev();
      }
    }
  }

  // Mouse Drag (Desktop)
  track.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    isMouseDown = true;
    mouseStartX = e.clientX;
    track.classList.add('grabbing');
  });

  window.addEventListener('mouseup', (e) => {
    if (!isMouseDown) return;
    isMouseDown = false;
    track.classList.remove('grabbing');
    const mouseDiff = mouseStartX - e.clientX;
    if (Math.abs(mouseDiff) > 50) {
      if (mouseDiff > 0) {
        slidePlansNext();
      } else {
        slidePlansPrev();
      }
    }
  });

  // Initial render
  renderMultitaskState(true);

  // Handle viewport resize between desktop & mobile
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderMultitaskState(false);
    }, 150);
  });
});

