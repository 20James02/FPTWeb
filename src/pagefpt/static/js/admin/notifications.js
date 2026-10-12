/** Employee-only due notices, durable acknowledgements and visible-tab polling. */
(() => {
  let data = { items: [], unread_count: 0 },
    timer = null,
    busy = false,
    failures = 0,
    dialog = null,
    hadSnapshot = false,
    seen = new Set();
  function badge() {
    const button = document.getElementById("admin-notices-button"),
      count = document.getElementById("admin-notices-count");
    if (!button) return;
    count.textContent = String(data.unread_count);
    button.setAttribute(
      "aria-label",
      `Nhắc thanh toán: ${data.unread_count} chưa đọc`,
    );
  }
  function render() {
    if (!dialog?.open) return;
    const list = dialog.querySelector(".billing-notice-list");
    const key = JSON.stringify(data.items);
    if (dialog.dataset.renderKey === key) return;
    dialog.dataset.renderKey = key;
    const previous = document.activeElement;
    const focusKey = list.contains(previous) ? previous.dataset.noticeId : null;
    const focusAction = previous?.dataset.noticeAction;
    list.replaceChildren();
    if (!data.items.length) {
      list.append(
        adminNode(
          "p",
          "Chưa có khoản đến hạn cho khách bạn đang phụ trách.",
          "billing-help",
        ),
      );
      if (focusKey)
        dialog.querySelector(".admin-dialog-actions button")?.focus();
      return;
    }
    for (const n of data.items) {
      const card = adminNode("article", "", "billing-notice");
      card.append(
        adminNode("strong", n.plan_name),
        adminNode(
          "p",
          `${adminMoney(n.amount_vnd)} · Hạn ${n.due_date.split("-").reverse().join("/")}`,
        ),
        adminNode(
          "p",
          "Hồ sơ " + n.lead_id.slice(0, 8).toUpperCase(),
          "billing-help",
        ),
      );
      const actions = adminNode("div", "", "billing-actions"),
        link = adminNode("a", "Xem hồ sơ", "btn-action-detail");
      link.href = "/admin/leads/detail?id=" + n.lead_id;
      link.dataset.noticeId = n.id;
      link.dataset.noticeAction = "open";
      actions.append(link);
      if (!n.read_at) {
        const read = adminNode(
          "button",
          "Đánh dấu đã đọc",
          "btn-action-detail",
        );
        read.type = "button";
        read.dataset.noticeId = n.id;
        read.dataset.noticeAction = "read";
        read.onclick = async () => {
          read.disabled = true;
          try {
            await crmRequest("/notifications/" + n.id + "/read", "POST");
            await refresh();
          } catch (e) {
            const error = dialog?.querySelector('[role="alert"]');
            if (error) error.textContent = e.message;
            read.disabled = false;
          }
        };
        actions.append(read);
      } else card.append(adminNode("span", "Đã đọc", "billing-help"));
      card.append(actions);
      list.append(card);
    }
    if (focusKey) {
      const controls = Array.from(list.querySelectorAll("[data-notice-id]"));
      const same = controls.find(
        (n) =>
          n.dataset.noticeId === focusKey &&
          n.dataset.noticeAction === focusAction,
      );
      const fallback = controls.find((n) => n.dataset.noticeId === focusKey);
      (
        same ||
        fallback ||
        dialog.querySelector(".admin-dialog-actions button")
      )?.focus();
    }
  }
  async function refresh() {
    if (
      busy ||
      document.visibilityState === "hidden" ||
      !adminHasPermission("lead.read")
    )
      return;
    busy = true;
    clearTimeout(timer);
    try {
      const next = await crmRequest("/notifications");
      data = next;
      badge();
      render();
      if (
        hadSnapshot &&
        next.items.some((n) => !n.read_at && !seen.has(n.id))
      ) {
        showToast(
          "Có khoản thanh toán đến hạn. Mở Nhắc thanh toán để xem.",
          "info",
        );
        if (typeof adminPlayLeadSound === "function") adminPlayLeadSound();
      }
      seen = new Set(next.items.map((n) => n.id));
      hadSnapshot = true;
      failures = 0;
      if (dialog?.open) dialog.querySelector('[role="alert"]').textContent = "";
    } catch (e) {
      failures = Math.min(failures + 1, 3);
      if (dialog?.open)
        dialog.querySelector('[role="alert"]').textContent =
          "Chưa tải được nhắc hạn. " + e.message;
    } finally {
      busy = false;
      timer = setTimeout(refresh, Math.min(120000, 30000 * 2 ** failures));
    }
  }
  async function open() {
    if (dialog?.open) return;
    dialog = document.createElement("dialog");
    dialog.className = "admin-dialog admin-billing-dialog";
    dialog.setAttribute("aria-label", "Nhắc thanh toán");
    const title = adminNode("h2", "Nhắc thanh toán"),
      help = adminNode(
        "p",
        "Các khoản đến hạn của khách bạn đang phụ trách.",
        "billing-help",
      ),
      list = adminNode("div", "", "billing-notice-list"),
      error = adminNode("p", "", "billing-error"),
      actions = adminNode("div", "", "admin-dialog-actions");
    error.setAttribute("role", "alert");
    const close = adminNode("button", "Đóng", "btn-action-detail"),
      reload = adminNode("button", "Làm mới", "btn-action-detail");
    close.type = reload.type = "button";
    close.onclick = () => dialog.close();
    reload.onclick = refresh;
    actions.append(reload, close);
    dialog.append(title, help, list, error, actions);
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        dialog.remove();
        dialog = null;
      },
      { once: true },
    );
    dialog.showModal();
    close.focus();
    render();
    await refresh();
  }
  window.refreshAdminPaymentNotices = refresh;
  document.addEventListener("DOMContentLoaded", () => {
    const button = document.getElementById("admin-notices-button");
    if (button && adminHasPermission("lead.read")) {
      button.onclick = open;
      refresh();
    }
  });
  document.addEventListener("visibilitychange", () => {
    clearTimeout(timer);
    if (document.visibilityState === "visible") refresh();
  });
})();
