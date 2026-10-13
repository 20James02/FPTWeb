
// Global auto-fill address helper (from Speedtest or Geolocation)
window.autoFillInstallationAddress = function (addressStr, isEstimated = false) {
  if (!addressStr || addressStr === "Không xác định") return;
  if (isEstimated && window.PageFPTAutoAddressPrecision === "high") return;
  if (!isEstimated) window.PageFPTAutoAddressPrecision = "high";

  window.PageFPTAutoAddress = addressStr;
  try {
    sessionStorage.setItem("fpt_auto_address", addressStr);
  } catch (_) {}

  const addrInput = document.getElementById("lead-address");
  if (addrInput) {
    addrInput.value = addressStr;
  }
  document.querySelectorAll("input[name='address']").forEach((inp) => {
    inp.value = addressStr;
  });

  const notice = document.getElementById("speed-auto-address-notice");
  if (notice) {
    notice.innerHTML = `📍 <strong>Vị trí đã xác định:</strong> ${addressStr} &bull; <em>Đã tự động điền vào Địa chỉ lắp đặt khi gửi yêu cầu!</em>`;
    notice.hidden = false;
  }
};

/**
 * PAGEFPT BOTTOM SHEET & FORM CONTROLLER
 * Smooth drag-to-dismiss, phone validation, and real submission flow
 * Dynamic quote verification and zero fake data
 */

let selectedPlanForForm = {
  name: "Tư vấn gói phù hợp",
  fee: "Nhân viên sẽ tư vấn giá chi tiết",
};
let selectedPlanId = null;
let selectedServiceId = "internet";
let activeQuoteToken = null;
let currentChallengeToken = null;

/**
 * Fetch dynamic quote from backend for selected plan and region
 */
let quoteGeneration = 0;
let quoteRequest = Promise.resolve();
let quoteExpiresAt = 0;
function refreshActiveQuote(provinceId = null) {
  const generation = ++quoteGeneration;
  const planId = selectedPlanId;
  const fee = document.getElementById("form-plan-fee");
  const regionId =
    provinceId ||
    (typeof getSelectedRegionId === "function" ? getSelectedRegionId() : null);
  activeQuoteToken = null;
  quoteExpiresAt = 0;
  if (fee)
    fee.textContent = planId
      ? "Đang xác nhận báo giá theo khu vực..."
      : "Giá cước: Nhân viên sẽ báo giá chi tiết";
  quoteRequest = (async () => {
    if (!planId) return;
    try {
      const response = await fetch("/api/v1/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
        body: JSON.stringify({
          plan_id: planId,
          region_id: regionId,
          billing_months: window.PageFPTAccessories?.term(planId) || 6,
          accessory_ids: window.PageFPTAccessories?.ids(planId) || [],
          ...(window.PageFPTLanding?.quoteContext?.() || {}),
          ...(window.PageFPTVoucher?.quoteContext?.() || {}),
        }),
      });
      if (!response.ok) throw new Error("Quote unavailable");
      const quote = await response.json();
      if (generation !== quoteGeneration || planId !== selectedPlanId) return;
      if (
        quote.status === "confirmed" &&
        typeof quote.quote_token === "string" &&
        quote.quote_token
      ) {
        activeQuoteToken = quote.quote_token;
        quoteExpiresAt = Date.parse(quote.expires_at) || 0;
        if (fee)
          fee.textContent = `Tổng trả trước: ${new Intl.NumberFormat("vi-VN").format(quote.initial_total_vnd)}đ (${quote.service_months || 6} tháng sử dụng)${window.PageFPTVoucher?.summary?.(quote) ? ' · ' + window.PageFPTVoucher.summary(quote) : ''}`;
      } else if (fee)
        fee.textContent =
          "Giá cước: Nhân viên sẽ báo giá chi tiết theo khu vực";
    } catch (_) {
      if (generation === quoteGeneration && fee)
        fee.textContent = "Chưa xác nhận giá. Nhân viên sẽ báo giá chi tiết.";
    }
  })();
  return quoteRequest;
}

// Open Bottom Sheet Form
function openBottomSheet(planName, planFee, planId = null, service = null) {
  selectedPlanForForm.name = planName || "Tư vấn gói phù hợp";
  selectedPlanForForm.fee = "Cần tư vấn";
  selectedPlanId = planId && /^[0-9a-f-]{36}$/i.test(planId) ? planId : null;

  const published =
    typeof getPublishedPlans === "function"
      ? getPublishedPlans().find((plan) => plan.id === selectedPlanId)
      : null;
  selectedServiceId =
    published?.service ||
    service ||
    document.querySelector("[data-page-service]")?.dataset.pageService ||
    "internet";
  if (
    !["internet", "combo", "camera", "business", "play"].includes(
      selectedServiceId,
    )
  )
    selectedServiceId = "internet";

  const summary = document.getElementById("form-selected-plan-box");
  if (summary) summary.hidden = !selectedPlanId;
  const planNameEl = document.getElementById("form-plan-name");
  const planFeeEl = document.getElementById("form-plan-fee");
  if (planNameEl)
    planNameEl.textContent = `${selectedPlanId ? "Gói Đang Chọn" : "Nhu cầu"}: ${selectedPlanForForm.name}`;
  if (planFeeEl)
    planFeeEl.textContent = `Cước tham khảo: ${selectedPlanForForm.fee}`;

  const backdrop = document.getElementById("bottom-sheet-backdrop");
  if (backdrop) {
    backdrop.classList.add("active");
    document.body.style.overflow = "hidden"; // Prevent background scroll
  }

  const addressInput = document.getElementById("lead-address");
  if (addressInput && !addressInput.value.trim()) {
    const saved = window.PageFPTAutoAddress || (typeof sessionStorage !== "undefined" && sessionStorage.getItem("fpt_auto_address"));
    if (saved) addressInput.value = saved;
  }

  // Refresh real quote from backend
  refreshActiveQuote();

  // Auto-focus phone input on desktop
  setTimeout(() => {
    const phoneInput = document.getElementById("lead-phone");
    if (
      phoneInput &&
      window.innerWidth > 640 &&
      backdrop?.classList.contains("active")
    ) {
      phoneInput.focus();
    }
  }, 200);

  // Track start_form event (whitelisted)
  if (typeof trackEvent === "function") {
    trackEvent("start_form", selectedPlanId ? { plan_id: selectedPlanId } : {});
  }
}

// Close Bottom Sheet Form
function closeBottomSheet() {
  const backdrop = document.getElementById("bottom-sheet-backdrop");
  if (backdrop) {
    backdrop.classList.remove("active");
    document.body.style.overflow = "";
  }
}

function handleBackdropClick(e) {
  if (e.target.id === "bottom-sheet-backdrop") {
    closeBottomSheet();
  }
}

// Phone Number Validation (Vietnam standard: 10 digits starting with 0)
function isValidVietnamPhone(phone) {
  const cleaned = phone.replace(/[\s\.\-]/g, "");
  return /^(?:0|\+?84)[35789][0-9]{8}$/.test(cleaned);
}

// Handle Form Submission
async function handleLeadSubmit(event) {
  event.preventDefault();
  if (window.PageFPTLanding?.preview) return;

  const phoneInput = document.getElementById("lead-phone");
  const nameInput = document.getElementById("lead-name");
  const addressInput = document.getElementById("lead-address");

  const hpInput = document.getElementById("lead-hp");
  const consentBox = document.getElementById("lead-consent");

  const phone = phoneInput.value.trim();
  if (!isValidVietnamPhone(phone)) {
    phoneInput.classList.add("error");
    phoneInput.setAttribute("aria-invalid", "true");
    phoneInput.focus();
    showToast("Vui lòng kiểm tra lại số điện thoại (gồm 10 chữ số).", "error");
    return;
  } else {
    phoneInput.classList.remove("error");
    phoneInput.removeAttribute("aria-invalid");
  }

  if (consentBox && !consentBox.checked) {
    showToast("Vui lòng đồng ý chính sách bảo mật để tiếp tục.", "error");
    return;
  }

  // Ensure session is initialized
  const submitBtn = document.getElementById("btn-submit-lead");
  if (submitBtn?.disabled) return;
  if (submitBtn) submitBtn.disabled = true;
  const submitText = document.getElementById("btn-submit-text");
  const submitSpinner = document.getElementById("btn-submit-spinner");
  if (submitText) submitText.textContent = "Đang tiếp nhận...";
  if (submitSpinner) submitSpinner.style.display = "inline-block";
  let sessionToken = null;
  if (typeof initClientSession === "function") {
    sessionToken = await initClientSession();
  }
  // Await the latest selection; old responses can never attach a stale quote.
  for (let attempt = 0; attempt < 5; attempt++) {
    const pending = quoteRequest;
    await pending;
    if (pending === quoteRequest) break;
  }
  if (selectedPlanId && activeQuoteToken && quoteExpiresAt <= Date.now())
    await refreshActiveQuote();
  const analyticsCtx =
    typeof getAnalyticsContext === "function" ? getAnalyticsContext() : {};
  if (!sessionToken && analyticsCtx.session_token) {
    sessionToken = analyticsCtx.session_token;
  }

  // Show Loading state

  if (submitBtn) submitBtn.disabled = true;
  if (submitText) submitText.textContent = "Đang tiếp nhận...";
  if (submitSpinner) submitSpinner.style.display = "inline-block";

  const location =
    typeof currentSelectedProvince !== "undefined"
      ? currentSelectedProvince
      : null;
  const selectedProvinceName = location?.name || "";
  const selectedZoneName = location?.zoneName || "";

  const notesParts = [];
  const landingSlug = window.PageFPTLanding?.quoteContext?.().landing_slug;
  if (landingSlug) notesParts.push(`[Landing: ${landingSlug}]`);
  if (selectedPlanForForm.name)
    notesParts.push(`[Gói quan tâm: ${selectedPlanForForm.name}]`);
  if (selectedPlanId)
    notesParts.push(
      `[Kỳ thanh toán quan tâm: ${window.PageFPTAccessories?.term(selectedPlanId) || 6} tháng]`,
    );
  const selectedWardName =
    typeof currentSelectedProvince !== "undefined"
      ? currentSelectedProvince.wardName
      : "";
  if (selectedWardName) notesParts.push(`[Xã/phường: ${selectedWardName}]`);
  if (selectedProvinceName && selectedProvinceName !== "Toàn quốc")
    notesParts.push(`[Khu vực: ${selectedProvinceName} - ${selectedZoneName}]`);

  const leadPayload = {
    ...(window.PageFPTVoucher?.leadContext?.() || {}),
    phone: phone,
    name: nameInput ? nameInput.value.trim() : "",
    service_ids: [selectedServiceId],
    plan_id: selectedPlanId || null,
    accessory_ids: window.PageFPTAccessories?.ids(selectedPlanId) || [],
    region_id:
      typeof getSelectedRegionId === "function" ? getSelectedRegionId() : null,
    installation_address: addressInput ? addressInput.value.trim() : "",
    notes: notesParts.join(" ").slice(0, 2000),
    preferred_contact_at: null,
    quote_token: activeQuoteToken || null,
    consent_version: "2026-09-v1",
    analytics_opt_in: Boolean(analyticsCtx.analytics_opt_in),
    marketing_opt_in: Boolean(analyticsCtx.marketing_opt_in),
    session_token: sessionToken || null,
    attribution_token: analyticsCtx.attribution_token || null,
    challenge_token: currentChallengeToken || null,
    website: hpInput ? hpInput.value.trim() : "",
  };

  try {
    const result = await submitLeadToBackend(leadPayload);

    // Reset button
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = "Gửi Yêu Cầu Tư Vấn";
    if (submitSpinner) submitSpinner.style.display = "none";

    // Close form and open Receipt Modal with real receipt
    closeBottomSheet();
    openConfirmationModal(result.receipt);

    // Fire celebratory confetti burst
    if (typeof fireConfettiCelebration === "function") {
      fireConfettiCelebration();
    }

    // Reset form fields
    const formEl = document.getElementById("lead-intake-form");
    if (formEl) formEl.reset();
    if (
      typeof syncAllProvinceInputs === "function" &&
      typeof currentSelectedProvince !== "undefined"
    )
      syncAllProvinceInputs(currentSelectedProvince);
  } catch (err) {
    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = "Gửi Yêu Cầu Tư Vấn";
    if (submitSpinner) submitSpinner.style.display = "none";

    if (err.code === "CHALLENGE_REQUIRED") {
      showToast("Cần xác minh bảo mật trước khi gửi yêu cầu.", "error");
    } else {
      showToast(
        err.message || "Chưa tiếp nhận yêu cầu. Vui lòng bấm gửi lại!",
        "error",
      );
    }
  }
}

// Confirmation / Receipt Modal Controls
function openConfirmationModal(receiptCode) {
  const receiptVal = document.getElementById("receipt-id-val");
  if (receiptVal) receiptVal.textContent = receiptCode || "Đã tiếp nhận";

  const backdrop = document.getElementById("confirmation-backdrop");
  if (backdrop) {
    backdrop.classList.add("active");
    document.body.style.overflow = "hidden";
  }
}

function closeConfirmationModal() {
  const backdrop = document.getElementById("confirmation-backdrop");
  if (backdrop) {
    backdrop.classList.remove("active");
    document.body.style.overflow = "";
  }
}

function copyReceiptCode() {
  const code = document.getElementById("receipt-id-val")?.textContent || "";
  if (code && navigator.clipboard) {
    navigator.clipboard.writeText(code);
    showToast("Đã sao chép mã tiếp nhận: " + code, "success");
  }
}

// Touch Drag Handle for Bottom Sheet Dismissal on Mobile
document.addEventListener("DOMContentLoaded", () => {
  const sheet = document.getElementById("bottom-sheet");
  const handle = document.getElementById("sheet-drag-handle");
  if (!sheet || !handle) return;

  let startY = 0;
  let currentY = 0;

  handle.addEventListener(
    "touchstart",
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true },
  );

  handle.addEventListener(
    "touchmove",
    (e) => {
      currentY = e.touches[0].clientY;
      const diff = currentY - startY;
      if (diff > 0) {
        sheet.style.transform = `translateY(${diff}px)`;
      }
    },
    { passive: true },
  );

  handle.addEventListener("touchend", () => {
    const diff = currentY - startY;
    if (diff > 100) {
      closeBottomSheet();
    }
    sheet.style.transform = "";
    startY = 0;
    currentY = 0;
  });
});
