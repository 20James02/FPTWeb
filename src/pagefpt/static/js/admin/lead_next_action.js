/** Suggestions open existing controls; they never change a lead automatically. */
function leadNextAction(lead, can) {
  const action = (title, detail, target = null) => ({ title, detail, target });
  if (["invalid", "duplicate", "rejected"].includes(lead.status))
    return action(
      "Hồ sơ đã kết thúc",
      "Đọc lịch sử xử lý trước khi quyết định bước tiếp theo.",
    );
  if (["closed", "installed"].includes(lead.status))
    return action(
      "Kiểm tra gói đã chốt & lịch thanh toán",
      "Đối chiếu gói, kỳ hạn và ngày thanh toán đã xác nhận với khách.",
      can.write ? "billing-heading" : null,
    );
  if (lead.status === "new" && !lead.assignee_id && can.assign)
    return action(
      "Phân công nhân viên phụ trách",
      "Chọn người nhận yêu cầu để bắt đầu liên hệ khách.",
      "btn-manual-assign",
    );
  if (!lead.payload?.address_confirmation?.confirmed_at && can.profile)
    return action(
      "Xác nhận địa chỉ lắp đặt",
      "Chọn tỉnh, xã/phường và kiểm tra địa chỉ khách đã nhập.",
      "btn-edit-profile",
    );
  if (
    ["new", "assigned", "contacting", "unreachable"].includes(lead.status) &&
    can.pii
  )
    return action(
      "Liên hệ và xác nhận nhu cầu",
      "Hiển thị thông tin liên hệ, gọi khách và ghi nhận kết quả trao đổi.",
      "btn-reveal-pii",
    );
  if (can.write)
    return action(
      "Ghi nhận bước xử lý tiếp theo",
      "Chọn trạng thái phù hợp; bổ sung lý do hoặc thông tin nghiệm thu khi hệ thống yêu cầu.",
      "lead-status-select",
    );
  return action(
    "Theo dõi tiến độ xử lý",
    "Xem lịch sử và trao đổi với nhân viên đang phụ trách hồ sơ.",
  );
}
function renderLeadNextAction(lead) {
  const panel = document.getElementById("lead-next-action");
  if (!panel) return;
  const action = leadNextAction(lead, {
    assign: adminHasPermission("lead.assign"),
    write: adminHasPermission("lead.write"),
    pii: adminHasPermission("lead.pii") && window.adminAAL === "aal2",
    profile:
      adminHasPermission("lead.write") &&
      adminHasPermission("lead.pii") &&
      window.adminAAL === "aal2",
  });
  panel.replaceChildren(
    adminNode("h2", action.title),
    adminNode("p", action.detail),
  );
  if (!action.target) return;
  const button = adminNode("button", "Thực hiện bước này", "btn-action-detail");
  button.type = "button";
  button.addEventListener("click", () => {
    const target = document.getElementById(action.target);
    if (!target || target.disabled || target.hidden) return;
    target.scrollIntoView({ block: "center", behavior: "instant" });
    if (target.tagName === "BUTTON") target.click();
    else {
      if (target.tagName === "H2") target.tabIndex = -1;
      target.focus();
    }
  });
  panel.append(button);
}
