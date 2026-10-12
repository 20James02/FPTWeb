/* Customer data is kept in memory and written only through the assigned-profile API. */
(() => {
  const button = document.getElementById("btn-edit-profile");
  if (!button) return;
  function errorMessage(data) {
    if (data.code === "VALIDATION_ERROR") {
      const labels = {
        plan_id: "Gói cước không hợp lệ. Hãy chọn lại gói trong danh sách.",
        province_code: "Hãy chọn tỉnh/thành trong danh sách.",
        ward_code: "Hãy chọn xã/phường sau khi danh sách tải xong.",
        installation_address: "Nhập địa chỉ cụ thể, tối đa 500 ký tự.",
        name: "Tên khách hàng không được quá 150 ký tự.",
        accessory_ids: "Kiểm tra lại danh sách phụ kiện đã chọn.",
      };
      for (const path of Object.keys(data.fields || {})) {
        const message = labels[path.split(".")[1]];
        if (message) return message;
      }
      return "Kiểm tra lại các trường bắt buộc trước khi lưu.";
    }
    return (
      {
        VERSION_CONFLICT:
          "Hồ sơ đã thay đổi. Giữ bản nháp này, tải lại hồ sơ trước khi lưu.",
        INVALID_ADDRESS: "Xã/phường không thuộc tỉnh/thành đã chọn.",
        INVALID_PROVINCE_CODE:
          "Tỉnh/thành không còn trong danh sách. Hãy chọn lại.",
        PLAN_UNAVAILABLE:
          "Gói cước đã ngừng hoặc chưa được công bố. Hãy chọn gói khác.",
        INVALID_ACCESSORY:
          "Phụ kiện không áp dụng cho gói đã chọn. Hãy chọn lại phụ kiện.",
        QUOTE_STALE:
          "Gói hoặc phụ kiện vừa thay đổi. Tải lại hồ sơ để chọn lại.",
        PERMISSION_DENIED:
          "Bạn chưa có quyền sửa hồ sơ này hoặc cần xác minh MFA.",
        UNAUTHENTICATED:
          "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi mở hồ sơ.",
        NOT_FOUND: "Hồ sơ hoặc gói không còn khả dụng. Hãy tải lại danh sách.",
        DATABASE_UNAVAILABLE:
          "Chưa kết nối được máy chủ dữ liệu. Giữ bản nhập và thử lại.",
      }[data.code] || "Chưa xử lý được yêu cầu. Vui lòng thử lại."
    );
  }
  async function request(path, method = "GET", body) {
    const r = await adminFetch("/api/v1/admin/" + path, {
      method,
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const data = await r.json();
    if (!r.ok) {
      const e = Error(errorMessage(data));
      e.code = data.code;
      throw e;
    }
    return data;
  }
  function field(form, title, id, type = "text") {
    const label = adminNode("label", "", "billing-field");
    label.htmlFor = id;
    label.append(adminNode("span", title));
    const input = document.createElement(
      type === "select" ? "select" : "input",
    );
    if (input.tagName === "INPUT") input.type = type;
    input.id = id;
    input.className = "form-input";
    label.append(input);
    form.append(label);
    return input;
  }
  function options(select, items, empty, key = "code") {
    select.replaceChildren();
    const initial = adminNode("option", empty);
    initial.value = "";
    select.append(initial);
    for (const item of items) {
      const option = adminNode("option", item.name);
      option.value = String(item[key]);
      select.append(option);
    }
  }
  button.onclick = async () => {
    if (!currentLead) return;
    button.disabled = true;
    let dialog;
    try {
      const [profile, provinces, plans, products] = await Promise.all([
        request("leads/" + currentLead.id + "/profile"),
        request("address-options"),
        fetch("/api/v1/catalog").then((r) => r.json()),
        fetch("/api/v1/accessories").then((r) => r.json()),
      ]);
      dialog = document.createElement("dialog");
      dialog.className = "admin-dialog admin-billing-dialog";
      dialog.dataset.preserveDraft = "true";
      dialog.setAttribute("aria-labelledby", "profile-dialog-heading");
      const heading = adminNode("h2", "Thông tin khách & Xác nhận địa chỉ");
      heading.id = "profile-dialog-heading";
      const form = document.createElement("form"),
        error = adminNode("p", "", "billing-error");
      error.setAttribute("role", "alert");
      const phone = field(
        form,
        "Số điện thoại (giữ nguyên)",
        "profile-phone",
        "tel",
      );
      phone.value = profile.pii.phone;
      phone.readOnly = true;
      const name = field(form, "Tên khách hàng", "profile-name");
      name.maxLength = 150;
      name.value = profile.pii.name || "";
      const province = field(
        form,
        "Tỉnh / thành phố *",
        "profile-province",
        "select",
      );
      province.required = true;
      options(province, provinces.items, "Chọn tỉnh/thành");
      const ward = field(form, "Xã / phường *", "profile-ward", "select");
      ward.required = true;
      ward.disabled = true;
      options(ward, [], "Chọn tỉnh/thành trước");
      const address = field(form, "Địa chỉ cụ thể *", "profile-address");
      address.required = true;
      address.maxLength = 500;
      address.value = profile.pii.installation_address || "";
      form.append(
        adminNode(
          "p",
          "Địa chỉ khách gửi được giữ trong lịch sử. Chọn đúng xã/phường sau khi xác nhận với khách.",
          "text-muted",
        ),
      );
      const plan = field(form, "Gói cước khách chọn", "profile-plan", "select");
      options(plan, plans.items, "Cần tư vấn gói phù hợp", "id");
      plan.value = profile.lead.payload.plan_id || "";
      const choices = adminNode("fieldset", "", "accessory-options");
      choices.append(adminNode("legend", "Phụ kiện đi kèm"));
      form.append(choices);
      const selected = new Set(profile.lead.payload.accessory_ids || []);
      function devices() {
        choices.querySelectorAll("label").forEach((el) => el.remove());
        const chosen = plans.items.find((p) => p.id === plan.value);
        for (const item of products.items.filter(
          (p) =>
            chosen &&
            p.service === chosen.service &&
            (!p.plan_ids?.length || p.plan_ids.includes(chosen.id)),
        )) {
          const label = adminNode("label", "", "admin-check"),
            box = document.createElement("input");
          box.type = "checkbox";
          box.value = item.id;
          box.checked = selected.has(item.id);
          box.onchange = () =>
            box.checked ? selected.add(item.id) : selected.delete(item.id);
          label.append(
            box,
            adminNode(
              "span",
              `${item.name} · ${adminMoney(item.price_vnd)} / ${item.billing_mode === "monthly" ? "tháng" : "một lần"}`,
            ),
          );
          choices.append(label);
        }
      }
      plan.onchange = () => {
        selected.clear();
        devices();
      };
      devices();
      const source = adminNode(
        "p",
        `Nguồn địa giới: ${PageFPTDates.format(provinces.source.fetched_at)}${provinces.source.warning ? " · " + provinces.source.warning : ""}`,
        "text-muted",
      );
      form.append(source);
      let generation = 0,
        busy = false;
      province.onchange = async () => {
        const seq = ++generation;
        ward.disabled = true;
        options(ward, [], "Đang tải…");
        error.textContent = "";
        if (!province.value) {
          options(ward, [], "Chọn tỉnh/thành trước");
          return;
        }
        try {
          const result = await request(
            "address-options?province_code=" + province.value,
          );
          if (seq !== generation) return;
          options(ward, result.items, "Chọn xã/phường");
          ward.disabled = false;
        } catch (e) {
          if (seq === generation) {
            options(ward, [], "Không tải được, chọn tỉnh lại");
            error.textContent = e.message;
          }
        }
      };
      const confirmation = profile.lead.payload.address_confirmation;
      if (confirmation) {
        province.value = String(confirmation.province_code);
        await province.onchange();
        ward.value = String(confirmation.ward_code);
      }
      const actions = adminNode("div", "", "admin-dialog-actions"),
        cancel = adminNode("button", "Hủy", "btn-action-detail"),
        save = adminNode("button", "Lưu & xác nhận địa chỉ", "btn-action-call");
      cancel.type = "button";
      save.type = "submit";
      cancel.onclick = () => dialog.close();
      actions.append(cancel, save);
      form.append(error, actions);
      dialog.append(heading, form);
      document.body.append(dialog);
      dialog.addEventListener("cancel", (e) => {
        if (busy) e.preventDefault();
      });
      dialog.addEventListener(
        "close",
        () => {
          phone.value = "";
          address.value = "";
          name.value = "";
          dialog.remove();
        },
        { once: true },
      );
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (busy || !form.reportValidity()) return;
        busy = true;
        save.disabled = cancel.disabled = true;
        error.textContent = "";
        try {
          const lead = await request(
            "leads/" + profile.lead.id + "/profile",
            "PUT",
            {
              expected_version: profile.lead.version,
              name: name.value,
              installation_address: address.value,
              province_code: Number(province.value),
              ward_code: Number(ward.value),
              plan_id: plan.value || null,
              accessory_ids: [...choices.querySelectorAll("input:checked")].map(
                (e) => e.value,
              ),
            },
          );
          currentLead = lead;
          renderLeadDetailData(lead);
          revealedPii = null;
          document.getElementById("btn-reveal-text").textContent =
            "Hiển thị thông tin";
          document.getElementById("btn-reveal-pii").disabled = false;
          document.getElementById("detail-name-val").textContent =
            "Bấm Hiển thị thông tin để xem";
          document.getElementById("detail-address-val").textContent =
            "Bấm Hiển thị thông tin để xem";
          dialog.close();
          showToast("Đã cập nhật hồ sơ và xác nhận địa chỉ.", "success");
        } catch (e) {
          error.textContent = e.message;
        } finally {
          busy = false;
          save.disabled = cancel.disabled = false;
        }
      };
      dialog.showModal();
      name.focus();
    } catch (e) {
      dialog?.remove();
      showToast(e.message, "error");
    } finally {
      button.disabled = false;
    }
  };
})();
