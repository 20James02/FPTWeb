/**
 * PAGEFPT INTERACTIVE QUIZ CONTROLLER
 * 3-step recommendation engine for broadband plans
 */

const quizState = {
  step: 1,
  answers: {
    usage: null,
    space: null,
    devices: null
  },
  recommended: {
    id: null, name: 'Tư vấn gói phù hợp', fee: '',
    reason: 'Nhân viên sẽ tư vấn gói và vùng phủ Wi-Fi theo nhu cầu của bạn.'
  }
};

function openQuizModal() {
  quizState.step = 1;
  updateQuizView();
  const backdrop = document.getElementById('quiz-backdrop');
  if (backdrop) {
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeQuizModal() {
  const backdrop = document.getElementById('quiz-backdrop');
  if (backdrop) {
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function handleQuizBackdropClick(e) {
  if (e.target.id === 'quiz-backdrop') {
    closeQuizModal();
  }
}

function selectQuizAnswer(step, value) {
  if (step === 1) {
    quizState.answers.usage = value;
    quizState.step = 2;
  } else if (step === 2) {
    quizState.answers.space = value;
    quizState.step = 3;
  } else if (step === 3) {
    quizState.answers.devices = value;
    calculateRecommendation();
    quizState.step = 4; // Result step
  }
  updateQuizView();
}

function calculateRecommendation() {
  const { usage, space, devices } = quizState.answers;

  const plans=(typeof getPublishedPlans === 'function' ? getPublishedPlans() : [])
    .filter(plan=>plan.service==='internet' && plan.id)
    .sort((a,b)=>(Number(a.speed_mbps)||0)-(Number(b.speed_mbps)||0));
  const highDemand=usage==='gaming' || space==='villa' || devices==='devices_high';
  const basic=usage==='basic' && space==='apartment' && devices==='devices_low';
  const plan=plans[highDemand ? plans.length-1 : basic ? 0 : Math.floor(plans.length/2)];
  quizState.recommended = {
    id: plan?.id || null,
    name: plan?.name || 'Tư vấn gói phù hợp',
    fee: '',
    reason: plan ? 'Gợi ý trong các gói đã công bố theo nhu cầu sử dụng. Giá, hạ tầng và vùng phủ Wi-Fi cần xác nhận theo khu vực.' : 'Chưa có gói được công bố. Nhân viên sẽ tư vấn gói và vùng phủ Wi-Fi theo nhu cầu của bạn.'
  };
}

function updateQuizView() {
  const step1 = document.getElementById('quiz-step-1');
  const step2 = document.getElementById('quiz-step-2');
  const step3 = document.getElementById('quiz-step-3');
  const result = document.getElementById('quiz-result');
  const progressBars = document.querySelectorAll('.quiz-step-bar');

  if (step1) step1.style.display = quizState.step === 1 ? 'block' : 'none';
  if (step2) step2.style.display = quizState.step === 2 ? 'block' : 'none';
  if (step3) step3.style.display = quizState.step === 3 ? 'block' : 'none';
  if (result) result.style.display = quizState.step === 4 ? 'block' : 'none';

  // Update progress bar
  progressBars.forEach((bar, index) => {
    if (index < quizState.step) {
      bar.style.background = 'var(--color-primary)';
    } else {
      bar.style.background = 'var(--border-subtle)';
    }
  });

  if (quizState.step === 4) {
    const nameEl = document.getElementById('quiz-recommended-name');
    const reasonEl = document.getElementById('quiz-recommended-reason');
    if (nameEl) nameEl.textContent = quizState.recommended.name;
    if (reasonEl) reasonEl.textContent = quizState.recommended.reason;

    if (typeof fireConfettiCelebration === 'function') {
      fireConfettiCelebration();
    }
  }
}

function applyQuizRecommendation() {
  closeQuizModal();
  openBottomSheet(quizState.recommended.name, quizState.recommended.fee, quizState.recommended.id);
}
