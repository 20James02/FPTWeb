/* Read-only status and explicit, evidenced reconciliation; no test conversions sent. */
(() => {
  const root = document.getElementById("delivery-console");
  if (!root) return;
  const state = document.getElementById("delivery-state"),
    list = document.getElementById("delivery-list");
  async function request(path, method = "GET", body) {
    const r = await adminFetch("/api/v1/admin/" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.message || d.error || "Kiểm tra quyền và MFA");
    return d;
  }
  async function load() {
    state.textContent = "Đang tải nhật ký gửi…";
    try {
      const [cap, result] = await Promise.all([
        request("integration-capabilities"),
        request("deliveries"),
      ]);
      state.textContent = `Gateway quảng cáo: ${cap.conversion_gateway_configured ? "Đã cấu hình; xem kết quả gửi bên dưới" : "Chưa cấu hình"} · Gateway thông báo: ${cap.notification_gateway_configured ? "Đã cấu hình" : "Chưa cấu hình"}. Trạng thái cấu hình không có nghĩa nhà cung cấp đã nhận sự kiện.`;
      list.replaceChildren();
      for (const row of result.items || []) {
        const card = adminNode("article", "", "workspace-item");
        card.append(
          adminNode(
            "h3",
            `${row.platform || row.provider || "Sự kiện"} · ${adminStatusLabel(row.state || row.status || "unknown")}`,
          ),
          adminNode(
            "p",
            `Lần thử: ${row.attempt || row.attempts || 0} · ${row.updated_at ? PageFPTDates.format(row.updated_at) : ""}`,
          ),
        );
        if (row.last_error) card.append(adminNode("p", row.last_error));
        const details = adminNode("details"),
          summary = adminNode("summary", "Mã đối soát");
        details.append(summary, adminNode("p", row.id));
        card.append(details);
        for (const [mode, label] of row.state === "unknown"
          ? [
              ["accepted", "Đã nhận — đối soát"],
              ["failed", "Xác nhận thất bại"],
              ["retry", "Xếp hàng thử lại"],
            ]
          : []) {
          const button = adminNode("button", label, "btn-action-detail");
          button.type = "button";
          button.onclick = async () => {
            const evidence = prompt(
              "Nhập mã hoặc đường dẫn bằng chứng đối soát (không nhập số điện thoại hay khóa):",
            );
            if (!evidence?.trim()) return;
            button.disabled = true;
            try {
              await request(`deliveries/${row.id}/reconcile`, "POST", {
                state: mode,
                evidence_ref: evidence.trim(),
              });
              await load();
            } catch (e) {
              state.textContent = e.message;
            } finally {
              button.disabled = false;
            }
          };
          card.append(button);
        }
        list.append(card);
      }
      if (!list.children.length)
        list.append(
          adminNode("p", "Chưa có lượt gửi trong phạm vi được phép."),
        );
    } catch (e) {
      state.textContent = e.message;
    }
  }
  document.getElementById("delivery-refresh").onclick = load;
  load();
})();
