/** Provider secrets stay in the server session. No browser storage of QR/OTP. */
(() => {
  const $ = (id) => document.getElementById(id);
  const GLOBAL = "00000000-0000-0000-0000-000000000000";
  const permissions = {
    "*": "Chủ hệ thống — toàn bộ quyền",
    "identity.manage": "Quản lý nhân viên",
    "lead.read": "Xem hồ sơ",
    "lead.write": "Cập nhật hồ sơ",
    "lead.pii": "Xem thông tin liên hệ",
    "lead.all": "Xem mọi hồ sơ chi nhánh",
    "lead.assign": "Phân công nhân viên",
    "catalog.write": "Sửa gói và địa bàn",
    "pricing.write": "Sửa giá",
    "pricing.publish": "Công bố giá",
    "content.write": "Biên tập nội dung",
    "content.publish": "Công bố nội dung",
    "marketing.write": "Quản lý chiến dịch",
    "report.read": "Xem báo cáo",
    "care.write": "Lập kế hoạch chăm sóc",
    "care.approve": "Duyệt chăm sóc",
    "intelligence.write": "Cập nhật đánh giá",
    "governance.write": "Xử lý quyền riêng tư",
    "governance.delete": "Xóa dữ liệu theo yêu cầu",
    "governance.export": "Xuất dữ liệu",
    "governance.audit": "Xem nhật ký",
    "workflow.manage": "Quản lý tác vụ và cài đặt",
  };
  const errors = {
    ACCOUNT_BUSY:
      "Tài khoản đang được cập nhật ở một phiên khác. Thử lại sau vài giây.",
    VERSION_CONFLICT:
      "Dữ liệu đã thay đổi. Đóng form và tải lại danh sách trước khi sửa.",
    MFA_REQUIRED: "Cần xác thực MFA để tiếp tục.",
    MFA_CODE_INVALID: "Mã MFA chưa đúng. Nhập mã hiện tại từ ứng dụng.",
    LAST_MFA_REQUIRED:
      "Thêm và xác minh một thiết bị dự phòng trước khi xóa thiết bị này.",
    PERMISSION_DENIED:
      "Bạn chưa có quyền hoặc chưa xác thực MFA cho thao tác này.",
    LAST_OWNER_REQUIRED:
      "Hệ thống cần ít nhất một chủ hệ thống đang hoạt động.",
    ACCOUNT_EXISTS: "Email đã tồn tại. Không tạo lại tài khoản này.",
    ACCOUNT_CREATE_REJECTED:
      "Chưa thể tạo tài khoản. Kiểm tra email và chính sách mật khẩu.",
    PASSWORD_REJECTED:
      "Mật khẩu mới chưa đáp ứng chính sách hoặc trùng mật khẩu cũ.",
    RATE_LIMITED: "Bạn thao tác quá nhanh. Chờ một phút rồi thử lại.",
    SESSION_REFRESH_BUSY: "Phiên đang được cập nhật. Thử lại sau vài giây.",
    UNAUTHENTICATED: "Mật khẩu hoặc mã MFA chưa đúng.",
  };
  let own,
    pendingFactor,
    roles = {},
    members = [],
    editing,
    staffOffset = 0,
    staffNext = null,
    staffSequence = 0,
    searchTimer;
  async function request(path, method = "GET", body) {
    const response = await adminFetch("/api/v1" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(
        errors[data.code] || "Không thể hoàn tất thao tác. Vui lòng thử lại.",
      );
      error.signInRequired = !!data.fields?.sign_in_required;
      throw error;
    }
    return data;
  }
  async function busy(form, action, state = $("account-state")) {
    const button = form.querySelector('button[type="submit"]');
    state.classList.remove("analytics-error");
    button.disabled = true;
    state.textContent = "Đang xử lý…";
    try {
      await action();
    } catch (error) {
      state.textContent = error.message;
      state.classList.add("analytics-error");
      if (error.signInRequired) {
        form.reset();
        state.textContent +=
          " Các phiên đã được thu hồi. Đăng nhập lại để tiếp tục.";
        state.append(adminNode("a", " Mở đăng nhập"));
        state.lastChild.href = "/admin/login";
      }
    } finally {
      button.disabled = false;
    }
  }
  function clearSetup() {
    pendingFactor = null;
    $("mfa-setup").hidden = true;
    $("mfa-qr").removeAttribute("src");
    $("mfa-secret").textContent = "";
    $("mfa-code").value = "";
  }
  async function loadAccount() {
    own = await request("/auth/account");
    adminMfaChoices(
      "account-password-factor",
      own.factors.filter(
        (f) => f.status === "verified" && f.factor_type === "totp",
      ),
    );
    $("account-email").textContent = own.email;
    $("account-aal").textContent =
      own.aal === "aal2" ? "Đã xác thực MFA" : "Chưa xác thực MFA";
    $("mfa-factors").replaceChildren();
    for (const factor of own.factors) {
      const card = adminNode("article", "", "workspace-item");
      card.append(
        adminNode("strong", factor.friendly_name || "Thiết bị MFA"),
        adminNode(
          "p",
          factor.status === "verified" ? "Đã xác minh" : "Chưa xác minh",
        ),
      );
      const remove = adminNode("button", "Xóa thiết bị", "btn-action-detail");
      remove.type = "button";
      remove.onclick = async () => {
        if (!(await adminConfirm("Xóa thiết bị xác thực này?", true))) return;
        try {
          await request("/auth/mfa/" + factor.id, "DELETE");
          clearSetup();
          await loadAccount();
        } catch (e) {
          $("account-state").textContent = e.message;
        }
      };
      card.append(remove);
      $("mfa-factors").append(card);
    }
    if (!own.factors.length)
      $("mfa-factors").append(
        adminNode(
          "p",
          "Chưa thiết lập MFA. Thêm thiết bị để bảo vệ tài khoản và dùng các thao tác quản trị nhạy cảm.",
        ),
      );
    $("account-memberships").replaceChildren();
    for (const member of own.memberships)
      $("account-memberships").append(
        adminNode(
          "p",
          (member.branch_id === GLOBAL ? "Toàn hệ thống" : member.branch_id) +
            " · " +
            member.permissions.map((p) => permissions[p] || p).join(", "),
        ),
      );
    $("account-state").textContent =
      "Đã tải tài khoản. QR chỉ hiển thị trong lúc thiết lập.";
  }
  $("mfa-enroll-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget, async () => {
      if (pendingFactor)
        throw new Error("Hoàn tất hoặc hủy thiết lập đang mở trước.");
      const data = await request("/auth/mfa/enroll", "POST", {
        name: $("mfa-name").value.trim(),
      });
      pendingFactor = data.id;
      $("mfa-qr").src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(data.totp.qr_code);
      $("mfa-secret").textContent = data.totp.secret;
      $("mfa-setup").hidden = false;
      $("mfa-code").focus();
      $("account-state").textContent =
        "Quét QR rồi nhập mã để xác minh thiết bị.";
    });
  };
  $("mfa-verify-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget, async () => {
      await request("/auth/mfa/" + pendingFactor + "/verify", "POST", {
        code: $("mfa-code").value,
      });
      const reloadRequired =
        window.adminAAL !== "aal2" &&
        own.memberships.some((m) => m.require_mfa);
      clearSetup();
      await loadAccount();
      window.adminAAL = own.aal;
      if (reloadRequired) {
        window.location.reload();
        return;
      }
      if ($("staff-list")) await loadStaff();
      $("account-state").textContent =
        "MFA đã được xác minh. Phiên hiện tại được nâng lên AAL2.";
    });
  };
  $("mfa-cancel").onclick = async () => {
    try {
      await request("/auth/mfa/" + pendingFactor, "DELETE");
      clearSetup();
      await loadAccount();
    } catch (e) {
      $("account-state").textContent = e.message;
    }
  };
  $("account-password-form").onsubmit = (e) => {
    e.preventDefault();
    busy(e.currentTarget, async () => {
      if (
        $("account-new-password").value !== $("account-password-confirm").value
      )
        throw new Error("Hai mật khẩu mới chưa khớp.");
      await request("/auth/account/password", "POST", {
        current_password: $("account-current-password").value,
        password: $("account-new-password").value,
        otp: $("account-password-otp").value,
        factor_id: $("account-password-factor").value || undefined,
      });
      e.target.reset();
      window.location.assign("/admin/login");
    });
  };
  const form = $("staff-form"),
    dialog = $("staff-dialog");
  function grantable(permission, branch) {
    return own.memberships.some(
      (m) =>
        (m.branch_id === GLOBAL || m.branch_id === branch) &&
        (m.permissions.includes("*") || m.permissions.includes(permission)),
    );
  }
  function drawPermissions(values) {
    $("staff-permission-list").replaceChildren();
    for (const [permission, label] of Object.entries(permissions)) {
      if (
        !grantable(permission, form.elements.branch_id.value) &&
        !values.includes(permission)
      )
        continue;
      const wrapper = adminNode("label", "", "admin-check"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.name = "permission";
      input.value = permission;
      input.checked = values.includes(permission);
      input.disabled = !grantable(permission, form.elements.branch_id.value);
      wrapper.append(input, document.createTextNode(label));
      $("staff-permission-list").append(wrapper);
    }
  }
  function openStaff(member) {
    editing = member || null;
    form.reset();
    $("staff-dialog-title").textContent = editing
      ? "Sửa nhân viên & quyền"
      : "Tạo tài khoản nhân viên";
    for (const id of [
      "staff-email-label",
      "staff-password-label",
      "staff-create-help",
    ])
      $(id).hidden = !!editing;
    for (const key of ["email", "password"])
      form.elements[key].required = !editing;
    form.elements.branch_id.disabled = !!editing;
    for (const id of [
      "staff-permissions",
      "staff-days",
      "staff-capacity-label",
      "staff-start-label",
      "staff-end-label",
      "staff-active-label",
    ])
      $(id).hidden = !editing;
    form.elements.role.required = !editing;
    form.elements.role.querySelector('[value=""]')?.remove();
    if (editing) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Giữ quyền hiện tại";
      form.elements.role.prepend(option);
      form.elements.role.value = "";
    }
    $("staff-form-state").textContent = "";
    if (editing) {
      form.elements.display_name.value = editing.display_name;
      form.elements.branch_id.value = editing.branch_id;
      form.elements.capacity.value = editing.capacity;
      form.elements.shift_start.value = editing.shift.start;
      form.elements.shift_end.value = editing.shift.end;
      form.elements.active.checked = editing.active;
      for (const input of form.querySelectorAll('[name="weekday"]'))
        input.checked = editing.shift.weekdays.includes(Number(input.value));
      drawPermissions(editing.permissions);
    } else {
      form.elements.role.value = "sales";
    }
    dialog.showModal();
    form.elements.display_name.focus();
  }
  function drawStaff() {
    const q = $("staff-search").value.trim().toLowerCase();
    $("staff-list").replaceChildren();
    $("staff-list").dataset.bulkContainer = "staff";
    const visible = members.filter((m) =>
      (m.display_name + " " + m.email).toLowerCase().includes(q),
    );
    for (const m of visible) {
      const card = adminNode("article", "", "workspace-item");
      
      // Xác định vai trò để gắn class màu sắc
      let roleClass = "staff-role-sales", avatarClass = "staff-avatar-sales", roleLabel = "Nhân viên kinh doanh";
      if (m.permissions.includes("admin") || m.branch_id === GLOBAL) {
        roleClass = "staff-role-admin";
        avatarClass = "staff-avatar-admin";
        roleLabel = "Quản trị viên";
      } else if (m.permissions.includes("lead.write") || m.permissions.includes("dispatch")) {
        roleClass = "staff-role-coordinator";
        avatarClass = "staff-avatar-coord";
        roleLabel = "Điều phối viên";
      } else if (m.permissions.includes("tech") || m.permissions.includes("install")) {
        roleClass = "staff-role-tech";
        avatarClass = "staff-avatar-tech";
        roleLabel = "Kỹ thuật viên";
      }

      card.className = "workspace-item " + roleClass + (m.active ? " staff-active" : " staff-locked");

      window.PageFPTAdminLists?.bindRow(card, {
        id: m.user_id + ":" + m.branch_id,
        version: m.version,
        kind: "staff",
        status: m.active ? "active" : "inactive",
        group: "staff",
        payload: {
          user_id: m.user_id,
          branch_id: m.branch_id,
          display_name: m.display_name,
          capacity: m.capacity,
          permissions: m.permissions,
          shift: m.shift,
        },
      });

      const header = adminNode("div", "", "staff-card-header");
      const initials = (m.display_name || m.email || "NV").trim().charAt(0).toUpperCase();
      const avatar = adminNode("div", initials, "staff-avatar " + avatarClass);
      avatar.setAttribute("aria-hidden", "true");

      const meta = adminNode("div", "", "staff-meta");
      meta.append(
        adminNode("strong", m.display_name || "Chưa có tên"),
        adminNode("p", m.email || m.user_id),
        adminNode("span", roleLabel, "staff-badge-role " + (roleClass === "staff-role-admin" ? "staff-badge-admin" : roleClass === "staff-role-coordinator" ? "staff-badge-coord" : roleClass === "staff-role-tech" ? "staff-badge-tech" : "staff-badge-sales")),
      );
      header.append(avatar, meta);

      const body = adminNode("div", "", "staff-card-body");
      body.append(
        adminNode(
          "p",
          "📍 " + (m.branch_id === GLOBAL ? "Toàn hệ thống" : "Chi nhánh " + m.branch_id) +
            " · " +
            (m.active ? "🟢 Đang hoạt động" : "🔴 Đã khóa"),
        ),
        adminNode(
          "p",
          "⚡ Sức chứa: " + (m.capacity ? m.capacity + " hồ sơ" : "Không giới hạn"),
        ),
        adminNode(
          "p",
          "🔑 " + m.permissions.map((p) => permissions[p] || p).join(" · "),
        ),
      );

      const actions = adminNode("div", "", "staff-card-actions");
      const edit = adminNode(
        "button",
        "Sửa quyền & ca làm",
        "btn-action-detail",
      );
      edit.type = "button";
      edit.onclick = () => openStaff(m);
      actions.append(edit);

      card.append(header, body, actions);
      $("staff-list").append(card);
    }
    if (!visible.length)
      $("staff-list").append(adminNode("p", "Không có nhân viên phù hợp."));
  }
  window.addEventListener("pagefpt-admin-bulk-complete", (e) => {
    if (e.detail.group === "staff") loadStaff();
  });
  async function loadStaff() {
    if (own.aal !== "aal2") {
      $("staff-list").replaceChildren(
        adminNode("p", "Xác minh MFA để xem và quản lý nhân viên."),
      );
      $("staff-create-open").disabled = true;
      return;
    }
    const current = ++staffSequence;
    const query = new URLSearchParams({
      offset: String(staffOffset),
      q: $("staff-search").value.trim(),
    });
    const [list, roleData, branches] = await Promise.all([
      request("/admin/staff?" + query),
      request("/admin/staff/roles"),
      request("/admin/staff/branches"),
    ]);
    if (current !== staffSequence) return;
    members = list.items;
    staffNext = list.next_offset;
    $("staff-prev").disabled = staffOffset === 0;
    $("staff-next").disabled = staffNext === null;
    $("staff-page").textContent =
      "Trang " + (staffOffset / 50 + 1) + " · " + members.length + " tài khoản";
    roles = roleData.roles;
    if (!dialog.open) {
      form.elements.role.replaceChildren();
      for (const [id, data] of Object.entries(roles)) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = data.label;
        form.elements.role.append(option);
      }
      form.elements.branch_id.replaceChildren();
      for (const branch of branches.items) {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        form.elements.branch_id.append(option);
      }
    }
    $("staff-create-open").disabled = false;
    drawStaff();
  }
  if (form) {
    $("staff-create-open").onclick = () => openStaff();
    $("staff-close").onclick = () => dialog.close();
    $("staff-prev").onclick = () => {
      staffOffset = Math.max(0, staffOffset - 50);
      loadStaff().catch((e) => ($("account-state").textContent = e.message));
    };
    $("staff-next").onclick = () => {
      if (staffNext === null) return;
      staffOffset = staffNext;
      loadStaff().catch((e) => ($("account-state").textContent = e.message));
    };
    $("staff-search").oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        staffOffset = 0;
        loadStaff().catch((e) => ($("account-state").textContent = e.message));
      }, 300);
    };
    form.elements.role.onchange = () => {
      if (editing && roles[form.elements.role.value])
        drawPermissions(roles[form.elements.role.value].permissions);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      busy(
        form,
        async () => {
          const data = new FormData(form);
          if (editing) {
            await request("/admin/memberships", "PUT", {
              user_id: editing.user_id,
              expected_version: editing.version,
              branch_id: editing.branch_id,
              display_name: data.get("display_name"),
              capacity: Number(data.get("capacity")),
              active: form.elements.active.checked,
              permissions: Array.from(
                form.querySelectorAll('[name="permission"]:checked'),
              ).map((x) => x.value),
              shift: {
                weekdays: data.getAll("weekday").map(Number),
                start: data.get("shift_start"),
                end: data.get("shift_end"),
              },
            });
          } else {
            await request("/admin/staff", "POST", {
              email: data.get("email"),
              password: data.get("password"),
              display_name: data.get("display_name"),
              branch_id: data.get("branch_id"),
              role: data.get("role"),
            });
          }
          form.elements.password.value = "";
          dialog.close();
          await loadStaff();
          $("account-state").textContent = "Đã lưu tài khoản nhân viên.";
        },
        $("staff-form-state"),
      );
    };
    dialog.addEventListener("close", () => {
      form.elements.password.value = "";
    });
  }
  window.addEventListener("pagehide", clearSetup);
  loadAccount()
    .then(() => form && loadStaff())
    .catch((e) => {
      $("account-state").textContent = e.message;
    });
})();
