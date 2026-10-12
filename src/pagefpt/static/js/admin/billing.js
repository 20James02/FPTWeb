/** Agreed package and explicit payment schedules. All values remain in memory. */
(() => {
  let leadId = null,
    deal = null,
    entries = [],
    nextBefore = null,
    generation = 0;
  const allowed = () =>
    adminHasPermission("lead.write") &&
    window.adminAAL === "aal2" &&
    !["invalid", "duplicate", "rejected"].includes(currentLead?.status);
  const dayLabel = (value) =>
    value ? value.split("-").reverse().join("/") : "Chưa có ngày";
  const termLabel = (months) =>
    months === 1 ? "Hằng tháng" : `${months} tháng / kỳ`;
  function field(
    form,
    labelText,
    id,
    type = "text",
    value = "",
    required = false,
  ) {
    const wrap = adminNode("label", "", "billing-field");
    wrap.htmlFor = id;
    wrap.append(adminNode("span", labelText));
    const input = document.createElement(
      type === "select" ? "select" : type === "textarea" ? "textarea" : "input",
    );
    if (input.tagName === "INPUT") input.type = type;
    input.id = id;
    input.className = "form-input";
    input.required = required;
    if (type === "textarea") {
      input.rows = 3;
      input.maxLength = 2000;
    }
    input.value = value ?? "";
    wrap.append(input);
    form.append(wrap);
    return input;
  }
  function formDialog(title, submitText, build, save) {
    const dialog = document.createElement("dialog");
    dialog.className = "admin-dialog admin-billing-dialog";
    dialog.dataset.preserveDraft = "true";
    dialog.setAttribute("aria-label", title);
    const form = document.createElement("form"),
      heading = adminNode("h2", title),
      error = adminNode("p", "", "billing-error"),
      actions = adminNode("div", "", "admin-dialog-actions");
    error.setAttribute("role", "alert");
    const cancel = adminNode("button", "Hủy", "btn-action-detail"),
      submit = adminNode("button", submitText, "btn-action-call");
    cancel.type = "button";
    submit.type = "submit";
    actions.append(cancel, submit);
    const read = build(form);
    form.append(error, actions);
    dialog.append(heading, form);
    document.body.append(dialog);
    let busy = false;
    cancel.onclick = () => dialog.close();
    dialog.addEventListener("cancel", (e) => {
      if (busy) e.preventDefault();
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy || !form.reportValidity()) return;
      busy = true;
      cancel.disabled = submit.disabled = true;
      submit.textContent = "Đang lưu…";
      error.textContent = "";
      try {
        await save(read());
        dialog.close();
        await loadLeadBilling(leadId);
        await window.refreshAdminPaymentNotices?.();
        showToast("Đã lưu thanh toán.", "success");
      } catch (e) {
        error.textContent =
          e.code === "VERSION_CONFLICT"
            ? "Dữ liệu đã được người khác sửa. Bản nháp vẫn được giữ; đóng cửa sổ và tải lại hồ sơ trước khi lưu."
            : e.message;
      } finally {
        busy = false;
        cancel.disabled = submit.disabled = false;
        submit.textContent = submitText;
      }
    };
    dialog.showModal();
    form.querySelector("input,select,textarea")?.focus();
  }
  function notesInput(form, id, value) {
    if (value?.notes_hidden) {
      form.append(
        adminNode(
          "p",
          "Ghi chú đang được bảo vệ. Cần quyền xem thông tin khách và xác thực hai lớp.",
          "billing-help",
        ),
      );
      return null;
    }
    return field(form, "Ghi chú", id, "textarea", value?.notes || "");
  }
  function render() {
    const summary = document.getElementById("billing-summary"),
      list = document.getElementById("billing-payments");
    if (!summary || !list) return;
    summary.replaceChildren();
    if (deal) {
      summary.append(
        adminNode("strong", deal.plan_name),
        adminNode("span", termLabel(deal.billing_months), "billing-term"),
      );
      if (deal.notes)
        summary.append(adminNode("p", deal.notes, "billing-help"));
    } else
      summary.append(
        adminNode("p", "Chưa ghi nhận gói khách đã chốt.", "billing-help"),
      );
    const choose = document.getElementById("billing-choose");
    choose.textContent = deal ? "Sửa gói đã chốt" : "Chọn gói đã chốt";
    choose.hidden = !allowed();
    const add = document.getElementById("billing-add");
    add.hidden = !allowed();
    add.disabled = !deal;
    list.replaceChildren();
    if (!entries.length)
      list.append(
        adminNode(
          "p",
          "Chưa có lịch thanh toán. Thêm ngày đến hạn và số tiền đã thống nhất.",
          "billing-help",
        ),
      );
    for (const item of entries) {
      const card = adminNode("article", "", "billing-payment"),
        header = adminNode("div", "", "billing-payment-heading");
      const label =
        item.status === "paid"
          ? "Đã thu"
          : item.status === "cancelled"
            ? "Đã hủy"
            : item.due_date < adminVietnamDay()
              ? "Quá hạn"
              : item.due_date === adminVietnamDay()
                ? "Đến hạn hôm nay"
                : "Chờ đến hạn";
      header.append(
        adminNode("strong", adminMoney(item.amount_vnd)),
        adminNode("span", label, "billing-state " + item.status),
      );
      card.append(header);
      card.append(
        adminNode(
          "p",
          `${dayLabel(item.due_date)} · ${item.plan_name} · ${termLabel(item.billing_months)}`,
          "billing-help",
        ),
      );
      if (item.notes) card.append(adminNode("p", item.notes, "billing-note"));
      else if (item.notes_hidden)
        card.append(
          adminNode("p", "Ghi chú đang được bảo vệ.", "billing-help"),
        );
      if (item.status === "paid" && item.paid_at)
        card.append(
          adminNode(
            "p",
            "Ghi nhận đã thu: " + PageFPTDates.format(item.paid_at),
            "billing-help",
          ),
        );
      if (item.status === "pending" && allowed()) {
        const actions = adminNode("div", "", "billing-actions");
        for (const [title, fn] of [
          ["Đánh dấu đã thu", () => collect(item)],
          ["Sửa lịch", () => editPayment(item)],
          ["Hủy lịch", () => cancelPayment(item)],
        ]) {
          const b = adminNode("button", title, "btn-action-detail");
          b.type = "button";
          b.onclick = fn;
          actions.append(b);
        }
        card.append(actions);
      }
      list.append(card);
    }
    const more = document.getElementById("billing-more");
    more.hidden = !nextBefore;
  }
  async function loadLeadBilling(id) {
    if (document.querySelector("dialog[data-preserve-draft][open]"))
      return false;
    leadId = id;
    const epoch = ++generation;
    try {
      const [data, payments] = await Promise.all([
        crmRequest(`/leads/${id}/billing`),
        crmRequest(`/leads/${id}/payments`),
      ]);
      if (epoch !== generation || id !== leadId) return false;
      deal = data.deal;
      entries = payments.items;
      nextBefore = payments.next_before;
      render();
      return true;
    } catch (e) {
      if (epoch === generation) {
        document
          .getElementById("billing-summary")
          ?.replaceChildren(adminNode("p", e.message, "billing-error"));
        document.getElementById("billing-add").disabled = true;
      }
      return false;
    }
  }
  async function chooseDeal() {
    if (!allowed()) return;
    const snapshot = deal;
    try {
      const r = await adminFetch("/api/v1/catalog");
      if (!r.ok) throw Error("Chưa tải được danh sách gói cước.");
      const data = await r.json();
      const plans = data.items || [];
      if (!plans.length) {
        showToast(
          "Chưa có gói được công bố. Hãy thiết lập gói cước trước.",
          "info",
        );
        return;
      }
      formDialog(
        snapshot ? "Sửa gói đã chốt" : "Chọn gói đã chốt",
        "Lưu gói đã chốt",
        (form) => {
          form.append(
            adminNode(
              "p",
              "Ghi nhận thỏa thuận với khách. Gói khách hỏi ban đầu và báo giá cũ vẫn được lưu.",
              "billing-help",
            ),
          );
          const plan = field(
            form,
            "Gói khách chốt",
            "billing-plan",
            "select",
            "",
            true,
          );
          plan.append(new Option("Chọn gói cước", ""));
          for (const p of plans)
            plan.append(
              new Option(p.name || p.payload?.name || "Gói cước", p.id),
            );
          plan.value = snapshot?.plan_id || "";
          const term = field(form, "Kỳ thanh toán", "billing-term", "select");
          for (const m of [1, 6, 12]) term.append(new Option(termLabel(m), m));
          term.value = String(snapshot?.billing_months || 1);
          const note = notesInput(form, "billing-notes", snapshot);
          return () => ({
            expected_version: snapshot?.version || 0,
            plan_id: plan.value,
            billing_months: Number(term.value),
            ...(note ? { notes: note.value } : {}),
          });
        },
        (body) => crmRequest(`/leads/${leadId}/billing`, "PUT", body),
      );
    } catch (e) {
      showToast(e.message, "error");
    }
  }
  function editPayment(item = null) {
    if (!allowed() || !deal) return;
    const paymentId = crypto.randomUUID(),
      version = deal.version;
    formDialog(
      item ? "Sửa lịch thanh toán" : "Thêm lịch thanh toán",
      "Lưu lịch thanh toán",
      (form) => {
        form.append(
          adminNode(
            "p",
            `Gói: ${item?.plan_name || deal.plan_name} · ${termLabel(item?.billing_months || deal.billing_months)}. Nhập số tiền của cả kỳ, gồm các khoản đã thống nhất.`,
            "billing-help",
          ),
        );
        const day = field(
          form,
          "Ngày đến hạn",
          "payment-date",
          "date",
          item?.due_date || adminVietnamDay(),
          true,
        );
        day.min = "2020-01-01";
        day.max = "2100-12-31";
        const amount = field(
          form,
          "Số tiền của cả kỳ (VND)",
          "payment-amount",
          "number",
          item?.amount_vnd ?? "",
          true,
        );
        amount.min = "1";
        amount.max = "1000000000";
        amount.step = "1";
        amount.inputMode = "numeric";
        const note = notesInput(form, "payment-notes", item);
        form.append(
          adminNode(
            "p",
            "Nhắc trong Admin vào ngày đến hạn, theo giờ Việt Nam, cho nhân viên đang phụ trách. Không tự thu tiền.",
            "billing-help",
          ),
        );
        return () => ({
          expected_version: item?.version || version,
          due_date: day.value,
          amount_vnd: Number(amount.value),
          ...(note ? { notes: note.value } : {}),
          ...(item ? { status: "pending" } : { payment_id: paymentId }),
        });
      },
      (body) =>
        crmRequest(
          item ? `/payments/${item.id}` : `/leads/${leadId}/payments`,
          item ? "PATCH" : "POST",
          body,
        ),
    );
  }
  function collect(item) {
    formDialog(
      "Ghi nhận khách đã thanh toán",
      "Xác nhận đã thu",
      (form) => {
        form.append(
          adminNode(
            "p",
            `${adminMoney(item.amount_vnd)} · ${dayLabel(item.due_date)} · ${item.plan_name}`,
          ),
        );
        const next = field(
          form,
          "Tạo lịch kỳ tiếp theo với cùng gói, kỳ và số tiền",
          "payment-next",
          "checkbox",
        );
        next.value = "yes";
        form.append(
          adminNode(
            "p",
            "Chỉ xác nhận sau khi đã kiểm tra khoản thanh toán. Đây là ghi nhận nội bộ.",
            "billing-help",
          ),
        );
        return () => ({
          expected_version: item.version,
          create_next: next.checked,
        });
      },
      (body) => crmRequest(`/payments/${item.id}/collect`, "POST", body),
    );
  }
  async function cancelPayment(item) {
    if (
      !(await adminConfirm(
        "Hủy lịch thanh toán này? Lịch đã hủy vẫn được lưu trong lịch sử và ngừng nhắc hạn.",
      ))
    )
      return;
    try {
      await crmRequest(`/payments/${item.id}`, "PATCH", {
        expected_version: item.version,
        status: "cancelled",
      });
      await loadLeadBilling(leadId);
      await window.refreshAdminPaymentNotices?.();
    } catch (e) {
      showToast(e.message, "error");
    }
  }
  window.loadLeadBilling = loadLeadBilling;
  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("billing-choose").onclick = chooseDeal;
    document.getElementById("billing-add").onclick = () => editPayment();
    document.getElementById("billing-more").onclick = async () => {
      const button = document.getElementById("billing-more");
      button.disabled = true;
      try {
        const p = await crmRequest(
          `/leads/${leadId}/payments?before=${nextBefore}`,
        );
        entries.push(...p.items);
        nextBefore = p.next_before;
        render();
      } catch (e) {
        showToast(e.message, "error");
      } finally {
        button.disabled = false;
      }
    };
  });
})();
