/** Shared display values. All provider/user text is inserted through textContent. */
const ADMIN_STATUS_LABELS = {
  new: "Mới tiếp nhận",
  assigned: "Đã phân công",
  contacting: "Đang liên hệ",
  contacted: "Đã liên hệ",
  qualified: "Đủ điều kiện",
  survey: "Khảo sát",
  quoted: "Đã báo giá",
  closed: "Khách đồng ý",
  installed: "Đã lắp đặt",
  unreachable: "Chưa liên lạc được",
  no_infrastructure: "Chưa có hạ tầng",
  invalid: "Thông tin không hợp lệ",
  duplicate: "Trùng lặp",
  rejected: "Từ chối / Hủy",
};
function adminStatusLabel(status) {
  return ADMIN_STATUS_LABELS[status] || status || "Chưa có dữ liệu";
}
function adminKanbanGroup(status) {
  return (
    {
      assigned: "new",
      contacted: "contacting",
      unreachable: "contacting",
      quoted: "qualified",
      closed: "qualified",
      no_infrastructure: "survey",
      invalid: "rejected",
      duplicate: "rejected",
    }[status] ||
    ([
      "new",
      "contacting",
      "qualified",
      "survey",
      "installed",
      "rejected",
    ].includes(status)
      ? status
      : "rejected")
  );
}
function adminVietnamDay(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const part = (key) => parts.find((x) => x.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function adminScoreReason(reason) {
  if (typeof reason === "string") return reason;
  if (!reason || typeof reason !== "object") return "Chưa có chi tiết tín hiệu";
  const labels = {
    phone_valid: "Định dạng số hợp lệ",
    otp: "Đã xác thực OTP",
    contacted: "Nhân viên đã liên hệ",
    needs_confirmed: "Đã xác nhận nhu cầu",
    select_plan: "Chọn gói",
    compare_plans: "So sánh gói",
    appointment: "Đặt lịch hẹn",
    view_cost: "Xem chi phí",
    return_visit: "Quay lại website",
    honeypot: "Tín hiệu honeypot",
    burst: "Gửi dồn dập",
    automation_pattern: "Dấu hiệu tự động",
    impossible_sequence: "Chuỗi hành vi bất thường",
  };
  const kinds = {
    confidence: "Tin cậy liên hệ",
    intent: "Nhu cầu",
    risk: "Rủi ro tự động",
  };
  return [
    labels[reason.signal] || reason.signal || "Tín hiệu",
    kinds[reason.kind] || reason.kind,
    reason.weight != null ? `Trọng số: ${reason.weight} điểm` : null,
    reason.age_days != null
      ? `${Number(reason.age_days).toFixed(1)} ngày trước`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
function adminMoney(value) {
  return value == null
    ? "Chưa có dữ liệu"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: "VND",
        maximumFractionDigits: 0,
      }).format(value);
}
function adminNode(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text ?? "";
  node.className = className;
  return node;
}

/** Native dialogs supply focus trapping, keyboard dismissal and accessible form labels. */
async function adminConfirm(message, danger = false) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog";
    dialog.setAttribute("aria-label", "Xác nhận thao tác");
    const title = adminNode("h2", "Xác nhận thao tác"),
      description = adminNode("p", message),
      actions = adminNode("div", "", "admin-dialog-actions"),
      cancel = adminNode("button", "Hủy", "btn-action-detail"),
      confirm = adminNode(
        "button",
        "Xác nhận",
        "btn-action-call" + (danger ? " danger" : ""),
      );
    cancel.type = confirm.type = "button";
    cancel.onclick = () => dialog.close();
    confirm.onclick = () => dialog.close("confirmed");
    actions.append(cancel, confirm);
    dialog.append(title, description, actions);
    dialog.addEventListener(
      "close",
      () => {
        const accepted = dialog.returnValue === "confirmed";
        dialog.remove();
        resolve(accepted);
      },
      { once: true },
    );
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}

async function adminAskText(title, maxLength = 500) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog";
    dialog.setAttribute("aria-label", title);
    const form = document.createElement("form"),
      label = adminNode("label", title),
      input = document.createElement("textarea");
    input.required = true;
    input.maxLength = maxLength;
    input.rows = 3;
    label.append(input);
    const actions = adminNode("div", "", "admin-dialog-actions"),
      cancel = adminNode("button", "Hủy", "btn-action-detail"),
      save = adminNode("button", "Xác nhận", "btn-action-call");
    cancel.type = "button";
    save.type = "submit";
    actions.append(cancel, save);
    form.append(label, actions);
    dialog.append(form);
    document.body.append(dialog);
    let result = null;
    cancel.onclick = () => dialog.close();
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      result = input.value.trim();
      dialog.close();
    };
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        resolve(result);
      },
      { once: true },
    );
    dialog.showModal();
    input.focus();
  });
}
function adminCanAssignLead(lead) {
  return (
    !!lead &&
    [
      "new",
      "assigned",
      "contacting",
      "contacted",
      "qualified",
      "survey",
      "quoted",
      "closed",
      "unreachable",
      "no_infrastructure",
    ].includes(lead.status)
  );
}
async function adminChooseAssignee(leads) {
  if (!leads.length) {
    showToast("Chọn ít nhất một hồ sơ còn đang xử lý.", "error");
    return;
  }
  if (leads.some((lead) => !adminCanAssignLead(lead))) {
    showToast(
      "Hồ sơ đã kết thúc hoặc trạng thái không hỗ trợ phân công. Tải lại hồ sơ để kiểm tra.",
      "error",
    );
    return;
  }
  try {
    const data = await crmRequest("/assignees");
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog";
    dialog.setAttribute("aria-label", "Phân công hồ sơ cho nhân viên");
    const form = document.createElement("form"),
      heading = adminNode("h2", `Phân công ${leads.length} hồ sơ`),
      label = adminNode("label", "Nhân viên"),
      select = document.createElement("select");
    select.required = true;
    select.style.width = "100%";
    select.style.minHeight = "44px";
    for (const member of data.items || []) {
      const option = adminNode(
        "option",
        `${member.display_name || member.user_id.slice(0, 8)} · ${member.active_leads}/${member.capacity} hồ sơ`,
      );
      option.value = member.user_id;
      select.append(option);
    }
    label.append(select);
    const error = adminNode("p", "", "workspace-error");
    error.setAttribute("role", "alert");
    const actions = adminNode("div", "", "admin-dialog-actions"),
      cancel = adminNode("button", "Hủy", "btn-action-detail"),
      save = adminNode("button", "Phân công", "btn-action-call");
    cancel.type = "button";
    save.type = "submit";
    save.disabled = !select.options.length;
    actions.append(cancel, save);
    form.append(
      heading,
      adminNode(
        "p",
        "Đổi nhân viên phụ trách giữ nguyên tiến độ xử lý và hạn phản hồi của hồ sơ.",
      ),
      label,
      error,
      actions,
    );
    dialog.append(form);
    document.body.append(dialog);
    cancel.onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await crmRequest("/lead-assignments", "POST", {
          assignee_id: select.value,
          items: leads.map((lead) => ({
            id: lead.id,
            expected_version: lead.version,
          })),
        });
        dialog.close();
        if (typeof crmSelectedLeads !== "undefined") crmSelectedLeads.clear();
        showToast("Đã phân công toàn bộ hồ sơ đã chọn.", "success");
        if (window.location.pathname === "/admin/leads")
          await refreshCrmLeads();
        else if (typeof initLeadDetail === "function") await initLeadDetail();
      } catch (e) {
        error.textContent = e.message;
      } finally {
        save.disabled = false;
      }
    };
    dialog.showModal();
    select.focus();
  } catch (e) {
    showToast(e.message, "error");
  }
}

let adminSoundEnabled = false;
let adminAudio = null;
async function adminEnableSound() {
  try {
    adminAudio = new (window.AudioContext || window.webkitAudioContext)();
    await adminAudio.resume();
    showToast("Đã cho phép phát chuông trên trang này.", "success");
  } catch (_) {
    showToast("Trình duyệt chưa cho phép phát âm thanh.", "error");
  }
}
function adminPlayLeadSound() {
  if (!adminSoundEnabled || !adminAudio || adminAudio.state !== "running")
    return;
  const tone = adminAudio.createOscillator(),
    gain = adminAudio.createGain();
  gain.gain.value = 0.08;
  tone.frequency.value = 660;
  tone.connect(gain);
  gain.connect(adminAudio.destination);
  tone.start();
  tone.stop(adminAudio.currentTime + 0.15);
}
async function adminRefreshLeadCount() {
  if (!adminHasPermission("lead.read")) return;
  try {
    const data = await crmRequest("/lead-counts");
    const counter = document.getElementById("sidebar-new-leads-count");
    if (counter) counter.textContent = String(data.new);
  } catch (_) {
    const counter = document.getElementById("sidebar-new-leads-count");
    if (counter) counter.textContent = "—";
  }
}
document.addEventListener("DOMContentLoaded", async () => {
  adminRefreshLeadCount();
  if (adminHasPermission("lead.read"))
    try {
      adminSoundEnabled = (await crmRequest("/operations/settings")).payload
        .sound_alert;
    } catch (_) {
      adminSoundEnabled = false;
    }
});

function adminDraftCost(price) {
  const coefficient = String(price.monthly_coefficient ?? 1);
  if (!/^\d+(?:\.\d{1,4})?$/.test(coefficient) || Number(coefficient) > 100)
    throw Error("Hệ số không hợp lệ");
  const [whole, fraction = ""] = coefficient.split(".");
  const scaled = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"));
  const monthly = (BigInt(price.monthly_vnd) * scaled + 5000n) / 10000n;
  const beforeVat =
    monthly * BigInt(price.billing_months) +
    BigInt(price.setup_vnd) +
    BigInt(price.equipment_vnd);
  const added = price.vat_included
    ? 0n
    : (beforeVat * BigInt(price.vat_bps) + 5000n) / 10000n;
  return Number(beforeVat + added);
}


/* ==========================================================================
   Admin Guides System (Quy trình & Hướng dẫn nghiệp vụ)
   ========================================================================== */
window.ADMIN_GUIDES = {
  leads: {
    badge: "CRM & KHÁCH HÀNG",
    title: "Quy trình Xử lý Hồ sơ & Đơn tư vấn Khách hàng",
    summary: "Quy chuẩn tiếp nhận, chăm sóc và theo dõi tiến độ lắp đặt viễn thông FPT từ khi khách để lại thông tin.",
    steps: [
      {
        num: 1,
        title: "Tiếp nhận & Phân công chuyên viên",
        desc: "Đơn mới gửi từ website sẽ hiển thị tại cột 'Mới tiếp nhận' kèm chuông báo. Sử dụng nút 'Phân công tự động' hoặc chọn nhân viên trực tiếp để phụ trách khách hàng trong ca trực."
      },
      {
        num: 2,
        title: "Hiển thị thông tin & Liên hệ tư vấn (1 chạm)",
        desc: "Bấm 'Hiển thị thông tin' để mở số điện thoại thật và địa chỉ. Bấm trực tiếp 'Gọi Cho Khách' hoặc 'Nhắn Zalo' để liên hệ tư vấn nhu cầu internet, combo truyền hình hoặc camera."
      },
      {
        num: 3,
        title: "Xác nhận địa bàn & Báo giá chi tiết",
        desc: "Hệ thống tự động tính giá theo từng xã/phường. Kiểm tra hạ tầng cáp tại khu vực khách yêu cầu và chọn kỳ thanh toán (trả trước 6 hoặc 12 tháng để nhận thêm ưu đãi tặng cước)."
      },
      {
        num: 4,
        title: "Cập nhật tiến trình & Ghi chú lịch hẹn",
        desc: "Sử dụng các nút gợi ý ghi chú nhanh ('✓ Đồng ý gói', '⏰ Hẹn gọi lại tối', '📞 Đang bận') để lưu nhật ký. Đặt 'Lịch Hẹn' để hệ thống tự động nhắc việc trước giờ hẹn."
      },
      {
        num: 5,
        title: "Chốt hợp đồng & Nghiệm thu lắp đặt",
        desc: "Chuyển trạng thái sang 'Khách chốt gói' khi khách đồng ý đăng ký. Khi kỹ thuật viên kéo cáp hoàn tất và nhập mã nghiệm thu hợp đồng, hồ sơ chuyển sang 'Đã lắp đặt'."
      }
    ],
    tips: [
      "Bộ lọc chi tiết được thu gọn vào nút 'Bộ Lọc Chi Tiết ▾' để bảng dữ liệu luôn chiếm toàn bộ màn hình làm việc.",
      "Có thể chuyển đổi linh hoạt giữa 'Dạng Bảng' (dành cho quản lý số lượng lớn) và 'Dạng Cột (Kanban)' (dành cho theo dõi tiến độ)."
    ],
    warnings: [
      "Hồ sơ mới cần được gọi lại trong thời hạn cam kết (SLA) để đảm bảo tỷ lệ chốt cao nhất.",
      "Thông tin liên hệ (số điện thoại, địa chỉ) được bảo mật. Mọi lượt hiển thị số đều được lưu nhật ký kiểm toán."
    ]
  },
  vouchers: {
    badge: "MARKETING & KHUYẾN MÃI",
    title: "Quy trình Thiết lập Voucher & Tạo Link Chia Sẻ",
    summary: "Hướng dẫn cấu hình chương trình ưu đãi cước, quà tặng và phân phối qua đường link ngắn kèm mã QR.",
    steps: [
      {
        num: 1,
        title: "Bước 1: Quyền lợi & Mức giảm",
        desc: "Nhập mã voucher (viết hoa không dấu, ví dụ: VT-COMBO-T10), đặt tên chiến dịch và chọn hình thức: Giảm tiền mặt cước phí, Tặng thêm tháng cước sử dụng hoặc Tặng phụ kiện/thiết bị."
      },
      {
        num: 2,
        title: "Bước 2: Gói cước & Địa bàn áp dụng",
        desc: "Chọn các gói cước được áp dụng mã. Có thể khoanh vùng theo tỉnh/thành hoặc quận/huyện cụ thể để tối ưu ngân sách khuyến mãi cho từng chi nhánh."
      },
      {
        num: 3,
        title: "Bước 3: Ngân sách & Hạn mức chiến dịch",
        desc: "Quy định tổng số lượng voucher phát hành, giới hạn ngân sách tối đa và thời gian áp dụng. Sau đó bấm '💾 Lưu bản nháp' và '🚀 Công bố chiến dịch'."
      },
      {
        num: 4,
        title: "Tạo Link chia sẻ & Tải mã QR Marketing",
        desc: "Tại mục 4, nhập mã link ngắn (ví dụ: fpt-vungtau-camera), chọn kênh (Zalo, Facebook, Tờ rơi) và bấm '+ Tạo link chia sẻ'. Tải mã QR định dạng vector SVG/PNG về để in tờ rơi hoặc gửi khách quét nhận ưu đãi."
      }
    ],
    tips: [
      "Dùng nút 'Nhân bản chiến dịch' trên danh sách để sao chép nhanh cấu hình từ voucher cũ sang tháng mới mà không cần nhập lại từ đầu.",
      "Hệ thống tự động chống vượt hạn mức tồn kho quà tặng (oversell) khi có nhiều nhân viên cùng phát mã."
    ],
    warnings: [
      "Chỉ công bố chiến dịch khi đã kiểm tra kỹ giá trị giảm và thời hạn áp dụng.",
      "Voucher đã công bố khi chỉnh sửa cần lưu ý các hồ sơ đang trong thời gian giữ chỗ (reservation)."
    ]
  },
  pricing: {
    badge: "BẢNG GIÁ & DỊCH VỤ",
    title: "Hướng dẫn Quản lý Gói cước & Bảng giá Địa bàn",
    summary: "Quy trình thiết lập bảng giá viễn thông FPT phân tầng theo địa phương, kỳ trả trước và thuế VAT.",
    steps: [
      {
        num: 1,
        title: "Thứ tự cấu hình chuẩn",
        desc: "Theo quy trình: Công bố Gói cước và Danh mục Địa bàn trước → Sau đó mới tạo và công bố Bảng giá. Gói cước đang ở trạng thái Bản nháp sẽ không thể công bố giá."
      },
      {
        num: 2,
        title: "Nguyên tắc kế thừa và ưu tiên giá",
        desc: "Hệ thống tìm giá hiển thị cho khách theo thứ tự: Xã/phường chi tiết → Tỉnh/thành → Giá mặc định toàn quốc. Bạn chỉ cần tạo giá riêng cho các khu vực có chính sách đặc thù."
      },
      {
        num: 3,
        title: "Thêm mức giá mới (+ Thêm giá mới)",
        desc: "Chọn gói cước, phạm vi áp dụng (Mặc định hoặc Tỉnh/Huyện/Xã), nhập cước tháng niêm yết, hệ số giá kỳ trả trước (1 tháng, 6 tháng, 12 tháng), số tháng tặng kèm và thời hạn hiệu lực."
      },
      {
        num: 4,
        title: "Đồng bộ địa giới hành chính",
        desc: "Sử dụng tính năng 'Đồng bộ địa giới hành chính' để cập nhật các đơn vị xã/phường mới nhất theo quy hoạch sáp nhập hành chính."
      }
    ],
    tips: [
      "Sử dụng công cụ 'Nhập CSV' để đưa hàng loạt bảng giá từ file bảng tính Excel vào hệ thống nhanh chóng.",
      "Bộ lọc bảng giá hỗ trợ tìm kiếm nhanh theo tên gói cước hoặc tên tỉnh/thành."
    ],
    warnings: [
      "Thay đổi bảng giá đã công bố sẽ có hiệu lực ngay lập tức trên trang khách hàng bên ngoài. Hãy kiểm tra kỹ trước khi bấm Công bố.",
      "Các thao tác công bố bảng giá diện rộng yêu cầu tài khoản quản trị viên và xác thực 2 bước (MFA)."
    ]
  },
  accessories: {
    badge: "THIẾT BỊ & PHỤ KIỆN",
    title: "Hướng dẫn Quản lý Thiết bị & Phụ kiện FPT",
    summary: "Quản lý modem WiFi 6, FPT Play Box, Camera an ninh AI bán kèm theo các gói cước viễn thông.",
    steps: [
      {
        num: 1,
        title: "Mở form thêm thiết bị",
        desc: "Bấm nút '+ Thêm phụ kiện' ở góc phải màn hình để mở hộp thoại cấu hình thiết bị mới."
      },
      {
        num: 2,
        title: "Thông tin sản phẩm & Nhóm dịch vụ",
        desc: "Nhập tên thiết bị (ví dụ: Modem WiFi 6 AX1800GZ), mã sản phẩm duy nhất và chọn nhóm dịch vụ tương ứng (Internet, Combo, Camera, Truyền hình)."
      },
      {
        num: 3,
        title: "Hình thức thanh toán & Báo giá",
        desc: "Chọn 'Thu một lần' (khách thanh toán đứt thiết bị khi ký hợp đồng) hoặc 'Thu theo tháng' (phí thuê thiết bị định kỳ). Giá nhập vào là giá đã gồm thuế VAT."
      },
      {
        num: 4,
        title: "Gói cước áp dụng & Hình ảnh",
        desc: "Chọn các gói cước được bán kèm thiết bị này (nếu để trống, thiết bị sẽ hiển thị cho mọi gói trong nhóm dịch vụ). Tải hình ảnh sản phẩm thực tế sắc nét."
      }
    ],
    tips: [
      "Thiết bị sau khi tạo ở trạng thái 'Bản nháp' có thể xem trước hiển thị trực quan trước khi công bố ra trang bán hàng.",
      "Khi tạm hết hàng, chuyển trạng thái sang 'Đã ngừng' để ẩn khỏi trang khách mà vẫn giữ nguyên lịch sử hợp đồng cũ."
    ],
    warnings: [
      "Kiểm tra kỹ mã sản phẩm không được trùng lặp với các thiết bị khác trong danh mục."
    ]
  },
  landing_pages: {
    badge: "TRANG ĐÍCH MARKETING",
    title: "Hướng dẫn Thiết kế Landing Page Chiến Dịch",
    summary: "Xây dựng các trang đích quảng cáo chuyên biệt với tỷ lệ chuyển đổi cao từ 8 mẫu FPT chuẩn có sẵn.",
    steps: [
      {
        num: 1,
        title: "Sử dụng Kho 8 Mẫu FPT Sẵn Có",
        desc: "Bấm nút '🎨 Kho Mẫu FPT Sẵn Có (8 Mẫu)' trên thanh công cụ để mở thư viện mẫu chuẩn: Combo Gia Đình, Cá Nhân / Sinh Viên, Camera AI, Doanh Nghiệp, Game Thủ Ultra Fast, Mega Sale,... Bấm 'Áp dụng mẫu này' để tự động nạp toàn bộ cấu hình chuẩn."
      },
      {
        num: 2,
        title: "Tùy biến nội dung & Thông tin liên hệ",
        desc: "Tại cột thiết lập bên trái, chỉnh sửa số điện thoại Hotline chi nhánh, địa phương phục vụ, tiêu đề chương trình và các phần quà hấp dẫn."
      },
      {
        num: 3,
        title: "Xem trước Live đa thiết bị (Desktop / Tablet / Mobile)",
        desc: "Bật khung xem trước trực tiếp bên phải và chuyển đổi các chế độ màn hình (Desktop 1440px, Tablet 768px, Mobile 390px/320px) để kiểm tra độ hiển thị sắc nét trên điện thoại di động."
      },
      {
        num: 4,
        title: "Lưu bản nháp & Công bố đường dẫn",
        desc: "Bấm 'Lưu bản nháp' khi hoàn thiện. Khi sẵn sàng chạy quảng cáo, chọn trạng thái 'Đã công bố' để đường dẫn landing page hoạt động trên website chính thức."
      }
    ],
    tips: [
      "Mỗi chiến dịch quảng cáo (Google Ads, Facebook Ads, TikTok) nên dùng một landing page riêng với ưu đãi và thông điệp phù hợp để tối đa hóa tỷ lệ chốt đơn.",
      "Bạn có thể sao chép nhanh (Nhân bản) một landing page đang chạy tốt để tạo biến thể cho khu vực khác."
    ],
    warnings: [
      "Đường dẫn (mã liên kết) của landing page phải viết thường không dấu, dùng dấu gạch ngang (ví dụ: internet-vungtau-khuyenmai).",
      "Form đăng ký trên khung Xem trước (Preview) được tắt để tránh ghi nhận số liệu thử nghiệm vào CRM thực tế."
    ]
  },
  link_performance: {
    badge: "PHÂN TÍCH & BÁO CÁO",
    title: "Hướng dẫn Đọc Chỉ Số & Đo Lường Hiệu Quả Link",
    summary: "Đo lường hành trình khách hàng từ lượt xem (Click) → Gửi form tư vấn → Chốt hợp đồng → Đã lắp đặt.",
    steps: [
      {
        num: 1,
        title: "Tạo link theo dõi nội dung (+ Tạo link content)",
        desc: "Bấm nút '+ Tạo link content', đặt tên nội dung (ví dụ: Video TikTok Khuyến mãi T10), mã đường dẫn rút gọn, chọn kênh (Facebook, TikTok, Zalo,...) và trang đích tiếp nhận."
      },
      {
        num: 2,
        title: "Ý nghĩa các chỉ số trong phễu chuyển đổi",
        desc: "• Click hợp lệ: Lượt truy cập của người dùng thực (đã tự động lọc bot). \n• Form đã lưu: Khách đã gửi số điện thoại tư vấn thành công. \n• Chốt: Hồ sơ nhân viên đã tư vấn thành công. \n• Lắp: Kỹ thuật viên đã kéo mạng và hoàn tất hợp đồng."
      },
      {
        num: 3,
        title: "Đánh giá tỷ lệ Chốt / Form",
        desc: "Tỷ lệ Chốt / Form phản ánh chất lượng nguồn khách. Tỷ lệ cao chứng tỏ thông điệp quảng cáo tiếp cận đúng đối tượng khách hàng có nhu cầu thực sự."
      },
      {
        num: 4,
        title: "Xuất dữ liệu báo cáo (CSV)",
        desc: "Bấm 'Xuất bảng đang xem' để tải xuống file số liệu chi tiết phục vụ báo cáo định kỳ cho ban giám đốc hoặc tính thưởng cho cộng tác viên."
      }
    ],
    tips: [
      "Nên gắn mã nhân viên hoặc cộng tác viên vào link để tự động thống kê doanh số theo từng người giới thiệu.",
      "Quan sát biểu đồ xu hướng theo ngày để kịp thời điều chỉnh ngân sách cho các bài viết hoặc video có hiệu suất cao."
    ],
    warnings: [
      "Chỉ số lượt click và thời gian tương tác chỉ tính trên các phiên người dùng đồng ý phân tích.",
      "Thông tin cá nhân khách hàng được bảo mật và ẩn danh trong báo cáo tổng hợp."
    ]
  }
};

function openAdminGuide(guideKey) {
  const guide = window.ADMIN_GUIDES && window.ADMIN_GUIDES[guideKey];
  if (!guide) {
    if (typeof showToast === "function") showToast("Chưa có nội dung hướng dẫn cho chức năng này.", "info");
    return;
  }
  const dialog = document.getElementById("admin-guide-dialog");
  if (!dialog) return;

  const badgeEl = document.getElementById("admin-guide-badge");
  const titleEl = document.getElementById("admin-guide-title");
  const summaryEl = document.getElementById("admin-guide-summary");
  const bodyEl = document.getElementById("admin-guide-body");

  if (badgeEl) badgeEl.textContent = guide.badge || "HƯỚNG DẪN THAO TÁC";
  if (titleEl) titleEl.textContent = guide.title || "Hướng Dẫn Nghiệp Vụ";
  if (summaryEl) summaryEl.textContent = guide.summary || "";

  if (bodyEl) {
    bodyEl.replaceChildren();

    // Steps container
    if (guide.steps && guide.steps.length) {
      const stepsSection = document.createElement("div");
      stepsSection.className = "admin-guide-steps-list";
      guide.steps.forEach((step) => {
        const item = document.createElement("div");
        item.className = "admin-guide-step-item";

        const numBox = document.createElement("div");
        numBox.className = "admin-guide-step-number";
        numBox.textContent = String(step.num || "•");

        const contentBox = document.createElement("div");
        contentBox.className = "admin-guide-step-content";

        const stepTitle = document.createElement("h4");
        stepTitle.textContent = step.title;

        const stepDesc = document.createElement("p");
        stepDesc.textContent = step.desc;

        contentBox.append(stepTitle, stepDesc);
        item.append(numBox, contentBox);
        stepsSection.append(item);
      });
      bodyEl.append(stepsSection);
    }

    // Tips container
    if (guide.tips && guide.tips.length) {
      const tipBox = document.createElement("div");
      tipBox.className = "admin-guide-callout tip";
      const tipHead = document.createElement("strong");
      tipHead.textContent = "💡 Mẹo thao tác nhanh:";
      tipBox.append(tipHead);
      const tipUl = document.createElement("ul");
      guide.tips.forEach((tip) => {
        const li = document.createElement("li");
        li.textContent = tip;
        tipUl.append(li);
      });
      tipBox.append(tipUl);
      bodyEl.append(tipBox);
    }

    // Warnings container
    if (guide.warnings && guide.warnings.length) {
      const warnBox = document.createElement("div");
      warnBox.className = "admin-guide-callout warning";
      const warnHead = document.createElement("strong");
      warnHead.textContent = "⚠️ Lưu ý nghiệp vụ quan trọng:";
      warnBox.append(warnHead);
      const warnUl = document.createElement("ul");
      guide.warnings.forEach((warn) => {
        const li = document.createElement("li");
        li.textContent = warn;
        warnUl.append(li);
      });
      warnBox.append(warnUl);
      bodyEl.append(warnBox);
    }
  }

  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeAdminGuide() {
  const dialog = document.getElementById("admin-guide-dialog");
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}
window.openAdminGuide = openAdminGuide;
window.closeAdminGuide = closeAdminGuide;
