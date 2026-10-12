/** Plain-language summary with the detailed evidence available on demand. */
function renderLeadIntelligence(lead) {
  const scores = lead.scores || {},
    observations = lead.observations || [];
  const confirmed = (field) =>
    observations.some(
      (o) =>
        o.field === field &&
        o.value === true &&
        o.status === "confirmed" &&
        (!o.expires_at || new Date(o.expires_at) > new Date()),
    );
  const contacted =
    confirmed("contacted") ||
    [
      "contacted",
      "qualified",
      "survey",
      "quoted",
      "closed",
      "installed",
    ].includes(lead.status);
  document.getElementById("intel-contact-summary").textContent = contacted
    ? "Đã ghi nhận liên hệ với khách"
    : "Cần liên hệ để xác nhận thông tin";
  document.getElementById("intel-need-summary").textContent = confirmed(
    "needs_confirmed",
  )
    ? "Đã xác nhận nhu cầu"
    : lead.labels?.plan
      ? "Khách quan tâm " + lead.labels.plan
      : "Khách cần tư vấn chọn gói";
  document.getElementById("intel-score-summary").textContent =
    scores.computed_at
      ? "Điểm giúp sắp xếp ưu tiên chăm sóc. Xem chi tiết khi cần."
      : "Chưa đủ dữ liệu đánh giá. Tiếp tục liên hệ và ghi nhận nhu cầu.";
  for (const [valueKey, labelId, barId, multiplier] of [
    ["contact_confidence", "score-contact-conf", "score-contact-bar", 1],
    ["intent", "score-intent", "score-intent-bar", 1],
    ["completeness", "score-completeness", "score-completeness-bar", 100],
    ["automation_risk", "score-risk", "score-risk-bar", 1],
  ]) {
    const raw =
        valueKey === "automation_risk" && scores.risk_status !== "evaluated"
          ? null
          : scores[valueKey],
      val =
        raw == null
          ? null
          : Math.max(0, Math.min(100, Math.round(raw * multiplier)));
    document.getElementById(labelId).textContent =
      val == null ? "Chưa có" : `${val}/100`;
    document.getElementById(barId).style.width = val == null ? "0%" : `${val}%`;
  }
  if (scores.risk_status === "evaluated") {
    const riskLabel = document.getElementById("score-risk");
    riskLabel.textContent += ` · ${scores.risk_checked_signals?.length || 0}/4 tín hiệu đã kiểm tra`;
  }
  const date = (at) => (at ? PageFPTDates.format(at) : "Chưa có");
  document.getElementById("lead-sla-summary").textContent =
    "Hạn liên hệ ban đầu: " + date(lead.sla_due_at);
  document.getElementById("intel-rule-summary").textContent =
    "Bộ quy tắc: " +
    (scores.ruleset_version || "Chưa tính") +
    " · Đánh giá lúc " +
    date(scores.computed_at);
  const facts = document.getElementById("lead-evidence-summary");
  facts.replaceChildren();
  const names = {
    otp: "Xác thực số điện thoại",
    contacted: "Đã liên hệ",
    needs_confirmed: "Nhu cầu",
    need: "Nhu cầu",
    region: "Địa bàn",
    infrastructure: "Hạ tầng",
    home_isp: "Mạng Internet tại nhà",
    phone_carrier: "Nhà mạng điện thoại",
  };
  const values = {
      true: "Có",
      false: "Chưa",
      yes: "Có",
      no: "Không",
      unknown: "Chưa biết",
    },
    statuses = {
      confirmed: "Đã xác nhận",
      inferred: "Ước tính",
      unknown: "Chưa xác nhận",
      needs_review: "Cần nhân viên kiểm tra",
    },
    sources = {
      staff: "Nhân viên",
      system: "Hệ thống",
      customer: "Khách cung cấp",
      client: "Khách cung cấp",
    };
  for (const o of observations) {
    const expired = o.expires_at && new Date(o.expires_at) <= new Date();
    facts.append(
      adminNode(
        "p",
        `${names[o.field] || "Thông tin bổ sung"}: ${typeof o.value === "object" ? "Có dữ liệu bổ sung" : values[String(o.value)] || String(o.value)} · ${expired ? "Đã hết hiệu lực" : statuses[o.status] || "Chưa xác nhận"} · ${sources[o.source] || "Nguồn bổ sung"}`,
      ),
    );
  }
  if (!observations.length)
    facts.append(adminNode("p", "Chưa có xác nhận bổ sung từ nhân viên."));
  const reasons = document.getElementById("score-reasons-container");
  reasons.replaceChildren();
  for (const reason of scores.reasons || [])
    reasons.append(adminNode("p", adminScoreReason(reason)));
  if (!scores.reasons?.length)
    reasons.append(adminNode("p", "Chưa có tín hiệu bổ sung để tính điểm."));
}
function showLeadIntelligence() {
  const d = document.getElementById("lead-intelligence-dialog");
  if (!d.open) d.showModal();
}
