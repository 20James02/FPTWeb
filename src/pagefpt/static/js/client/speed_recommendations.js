/* Published packages and region quotes reuse the intake boundary. No measurement data leaves this page. */
(function () {
  "use strict";
  const grid = document.getElementById("speedtest-plan-grid");
  if (!grid) return;
  const model = window.PageFPTSpeedModel,
    plans = getPublishedPlans();
  const cards = new Map(
    Array.from(grid.querySelectorAll("[data-speed-plan]")).map((el) => [
      el.dataset.speedPlan,
      el,
    ]),
  );
  let version = 0,
    controller = null,
    paused = false,
    download = null;
  const money = new Intl.NumberFormat("vi-VN");
  function path() {
    return typeof getSelectedRegionPath === "function"
      ? getSelectedRegionPath()
      : [];
  }
  function cancel() {
    ++version;
    controller?.abort();
    controller = null;
  }
  async function refresh() {
    cancel();
    window.PageFPTAccessories?.clearQuotes();
    const generation = version,
      regionPath = path(),
      region = regionPath[0] || null;
    const requestController = new AbortController();
    controller = requestController;
    const signal = requestController.signal,
      timeout = setTimeout(() => requestController.abort(), 12000);
    const blocked = new Set(),
      quotes = new Map();
    let selected = [];
    const note = document.getElementById("speed-recommend-note");
    document.getElementById("speed-recommend-heading").textContent =
      download !== null
        ? "Đo xong. Chọn gói dễ hơn."
        : "Chọn gói phù hợp với nhu cầu";
    note.textContent =
      download !== null
        ? "Tham khảo theo tốc độ vừa đo. Chọn địa bàn để xác nhận giá và điều kiện lắp đặt."
        : "Xem giá đúng địa chỉ. Gửi yêu cầu để được tư vấn gói phù hợp.";
    const result = document.getElementById("speed-recommend-result");
    result.hidden = download === null;
    result.textContent =
      download === null
        ? ""
        : "Download vừa đo: " +
          money.format(Math.round(download * 10) / 10) +
          " Mbps";
    function render() {
      if (generation !== version) return;
      selected = model.rank(
        plans.filter((p) => !blocked.has(p.id)),
        { regionPath, download },
      );
      grid.dataset.cardCount = String(selected.length);
      const ids = new Set(selected.map((p) => p.id));
      cards.forEach((card, id) => (card.hidden = !ids.has(id)));
      for (const [index, plan] of selected.entries()) {
        const card = cards.get(plan.id);
        if (!card) continue;
        grid.appendChild(card);
        const fit = window.PageFPTSpeedCards.fit(plan, download, index);
        card.classList.toggle("is-highlighted", fit.highlighted);
        card.querySelector(".speed-plan-match").hidden = !fit.highlighted;
        card.querySelector(".speed-plan-hook").textContent = fit.hook;
        card.querySelector(".speed-plan-reason span").textContent = fit.reason;
        const quote = quotes.get(plan.id),
          fee = card.querySelector(".speed-plan-price"),
          details = card.querySelector(".speed-plan-quote");
        fee.textContent = "Cần tư vấn";
        card.querySelector(".speed-plan-price-label").textContent =
          "Giá theo địa bàn";
        card.querySelector(".speed-plan-price-unit").textContent = "";
        details.textContent = region
          ? paused
            ? "Giá sẽ được xác nhận sau khi kết thúc đo tốc độ."
            : "Đang xác nhận giá theo địa bàn…"
          : "Chọn khu vực để xác nhận giá, VAT và kỳ thanh toán.";
        if (quote !== undefined)
          details.textContent =
            "Chưa xác nhận được giá. Nhân viên sẽ tư vấn chi tiết.";
        const price = window.PageFPTSpeedCards.price(quote);
        if (price) {
          fee.textContent = price.amount;
          card.querySelector(".speed-plan-price-label").textContent =
            price.caption;
          card.querySelector(".speed-plan-price-unit").textContent = price.unit;
          details.textContent = price.note;
        }
      }
      document.getElementById("speedtest-plans-empty").hidden =
        selected.length > 0;
    }
    render();
    if (paused) {
      clearTimeout(timeout);
      return;
    }
    try {
      // Replace explicitly unavailable plans, retaining quotes for the same region generation.
      for (
        let round = 0;
        region &&
        round < plans.length &&
        generation === version &&
        !signal.aborted;
        round++
      ) {
        const pending = selected.filter((p) => !quotes.has(p.id));
        if (!pending.length) break;
        await Promise.all(
          pending.map(async (plan) => {
            try {
              const response = await fetch("/api/v1/quotes", {
                method: "POST",
                signal,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  plan_id: plan.id,
                  region_id: region,
                  billing_months: 6,
                }),
              });
              if (!response.ok) throw Error("quote unavailable");
              const data = await response.json();
              if (generation !== version) return;
              quotes.set(plan.id, data);
              if (window.PageFPTSpeedCards.price(data))
                window.PageFPTAccessories?.acceptQuote(plan.id, data);
              if (data.status === "not_available") blocked.add(plan.id);
            } catch (_) {
              if (generation === version) quotes.set(plan.id, null);
            }
          }),
        );
        render();
      }
    } finally {
      clearTimeout(timeout);
      if (generation === version && signal.aborted) {
        for (const p of selected) if (!quotes.has(p.id)) quotes.set(p.id, null);
        render();
      }
    }
  }
  window.PageFPTSpeedRecommendations = {
    pause(value) {
      paused = value;
      cancel();
      if (!paused) refresh();
    },
    update(value) {
      download =
        typeof value === "number" && Number.isFinite(value) && value > 0
          ? value
          : null;
      if (!paused) refresh();
    },
  };
  document.addEventListener("pagefpt:location-change", refresh);
  document.addEventListener("DOMContentLoaded", refresh);
  window.addEventListener("pagehide", cancel);
})();
