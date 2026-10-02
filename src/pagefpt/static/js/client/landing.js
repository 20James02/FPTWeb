/** Published plan/region IDs and bounded quotes for the direct campaign form. */
let landingQuoteGeneration = 0;
let landingSubmitBusy = false;
async function refreshLandingQuote() {
  const generation = ++landingQuoteGeneration;
  const plan = document.getElementById("lp-plan").value;
  const region =
    document.getElementById("lp-ward")?.value ||
    document.getElementById("lp-region").value;
  const label = document.getElementById("lp-quote");
  label.textContent = "Giá cần tư vấn theo gói và khu vực.";
  if (!plan || !region) return null;
  try {
    label.textContent = "Đang xác nhận báo giá...";
    const response = await fetch("/api/v1/quotes", {
      method: "POST",
      signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: plan,
        region_id: region,
        billing_months: 6,
      }),
    });
    const quote = await response.json();
    if (generation !== landingQuoteGeneration) return null;
    if (response.ok && quote.status === "not_available") {
      label.textContent =
        "Gói chưa cung cấp tại địa bàn này. Chúng tôi sẽ tư vấn gói phù hợp.";
      return quote;
    }
    if (!response.ok || quote.status !== "confirmed" || !quote.quote_token)
      throw new Error();
    label.textContent = `Tổng trả trước: ${new Intl.NumberFormat("vi-VN").format(quote.initial_total_vnd)}đ (${quote.service_months} tháng sử dụng)`;
    return quote;
  } catch (_) {
    if (generation === landingQuoteGeneration)
      label.textContent = "Chưa xác nhận giá. Nhân viên sẽ tư vấn chi tiết.";
    return null;
  }
}
async function handleDirectLeadSubmit(event) {
  event.preventDefault();
  if (landingSubmitBusy) return;
  const phone = document.getElementById("lp-phone").value.trim();
  if (!isValidVietnamPhone(phone)) {
    showToast("Vui lòng nhập số điện thoại hợp lệ (10 số).", "error");
    return;
  }
  if (!document.getElementById("lp-consent").checked) {
    showToast("Vui lòng đồng ý để được liên hệ tư vấn.", "error");
    return;
  }
  const plan = document.getElementById("lp-plan"),
    region = document.getElementById("lp-region");
  const button = event.target.querySelector('button[type="submit"]');
  const ward = document.getElementById("lp-ward");
  landingSubmitBusy = true;
  button.disabled = true;
  plan.disabled = true;
  region.disabled = true;
  if (ward) ward.disabled = true;
  try {
    const quote = await refreshLandingQuote();
    const published = getPublishedPlans().find(
      (item) => item.id === plan.value,
    );
    const payload = {
      phone,
      plan_id: quote?.status === "not_available" ? null : published?.id || null,
      region_id:
        document.getElementById("lp-ward")?.value || region.value || null,
      service_ids: published ? [published.service] : ["internet"],
      quote_token: quote?.quote_token || null,
      notes: `[Campaign Landing Page] Quan tâm: ${plan.options[plan.selectedIndex].text}; Khu vực: ${region.options[region.selectedIndex].text}`,
      preferred_contact_at: null,
      consent_version: "2026-09-v1",
      analytics_opt_in: false,
      marketing_opt_in: false,
      ...(typeof getAnalyticsContext === "function"
        ? getAnalyticsContext()
        : {}),
    };
    const result = await submitLeadToBackend(payload);
    openConfirmationModal(result.receipt);
  } catch (error) {
    showToast(
      error.message || "Chưa gửi được yêu cầu. Vui lòng thử lại.",
      "error",
    );
  } finally {
    landingSubmitBusy = false;
    button.disabled = false;
    plan.disabled = false;
    region.disabled = false;
    if (ward) ward.disabled = ward.options.length <= 1;
  }
}

let landingLocationGeneration = 0;
async function landingProvinceChanged() {
  const generation = ++landingLocationGeneration;
  const ward = document.getElementById("lp-ward"),
    province = document.getElementById("lp-region").value;
  ward.replaceChildren(new Option("Chọn xã/phường (không bắt buộc)", ""));
  ward.disabled = true;
  refreshLandingQuote();
  if (!province) return;
  try {
    const rows = await fetchLocationWards(province);
    if (generation !== landingLocationGeneration) return;
    for (const row of rows) ward.append(new Option(row.name, row.id));
    ward.disabled = landingSubmitBusy || !rows.length;
  } catch (_) {
    if (generation === landingLocationGeneration)
      ward.replaceChildren(
        new Option("Chưa tải được — chọn lại tỉnh để thử", ""),
      );
  }
}
document.addEventListener("DOMContentLoaded", () => landingProvinceChanged());
