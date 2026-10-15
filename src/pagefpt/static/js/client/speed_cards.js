/* Card copy describes published facts and a local measurement; it never promises delivered speed. */
(() => {
  const money = (n) => new Intl.NumberFormat("vi-VN").format(n) + "đ";
  window.PageFPTSpeedCards = {
    price(q) {
      if (
        q?.status !== "confirmed" ||
        q.billing_months !== 6 ||
        !Number.isInteger(q.initial_total_vnd) ||
        q.initial_total_vnd < 0 ||
        typeof q.vat_included !== "boolean" ||
        (q.monthly_vnd !== null &&
          (!Number.isInteger(q.monthly_vnd) || q.monthly_vnd < 0)) ||
        (q.expires_at && !(Date.parse(q.expires_at) > Date.now()))
      )
        return null;
      const prepaid = q.monthly_vnd === null;
      return {
        amount: money(prepaid ? q.initial_total_vnd : q.display_monthly_vnd ?? q.monthly_vnd),
        caption: prepaid ? "Thanh toán ban đầu" : q.display_monthly_vnd != null ? "Bình quân mỗi tháng" : "Giá mỗi tháng",
        unit: prepaid ? "" : "/tháng",
        note: `${q.vat_included ? "Đã gồm VAT" : "Chưa gồm VAT"} · Kỳ 6 tháng${prepaid ? "" : " · Ban đầu " + money(q.initial_total_vnd)}`,
      };
    },
    fit(plan, download, index) {
      const measured =
        typeof download === "number" &&
        Number.isFinite(download) &&
        download > 0;
      const faster =
        measured &&
        typeof plan.speed_mbps === "number" &&
        plan.speed_mbps >= download * 1.15;
      const hook =
        {
          internet: "Cho gia đình, học tập & làm việc",
          combo: "Một gói cho nhiều nhu cầu kết nối",
          business: "Kết nối theo nhu cầu kinh doanh",
        }[plan.service] || "Chọn kết nối theo nhu cầu của bạn";
      return {
        highlighted: measured && index === 0,
        hook,
        reason: faster
          ? "Băng thông niêm yết cao hơn download vừa đo."
          : "Tham khảo theo nhu cầu và thiết bị đang dùng.",
      };
    },
  };
})();
