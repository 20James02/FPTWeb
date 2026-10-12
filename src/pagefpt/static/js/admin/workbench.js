/** Bounded, authorized queues. No invented global counts or automatic transitions. */
(() => {
  const root = document.getElementById("workbench-groups");
  if (!root) return;
  const state = document.getElementById("workbench-state");
  const refresh = document.getElementById("workbench-refresh");
  const definitions = {
    overdue: {
      title: "Cần liên hệ ngay",
      note: "Đã vượt hạn liên hệ",
      action: "Mở hồ sơ quá hạn",
    },
    new: {
      title: "Yêu cầu mới",
      note: "Chưa phân công xử lý",
      action: "Kiểm tra yêu cầu",
    },
    assigned: {
      title: "Chờ liên hệ",
      note: "Đã có nhân viên phụ trách",
      action: "Liên hệ khách",
    },
    contacting: {
      title: "Đang trao đổi",
      note: "Ghi nhận kết quả và bước tiếp theo",
      action: "Tiếp tục xử lý",
    },
  };
  async function load() {
    refresh.disabled = true;
    root.setAttribute("aria-busy", "true");
    state.textContent = "Đang cập nhật công việc…";
    try {
      const response = await adminFetch("/api/v1/admin/workbench?limit=6");
      if (!response.ok)
        throw new Error("Chưa tải được công việc. Bấm Làm mới để thử lại.");
      const data = await response.json();
      const sections = [];
      for (const group of data.groups || []) {
        const definition = definitions[group.key];
        if (!definition) continue;
        const section = adminNode("section", "", "workbench-group");
        section.dataset.queue = group.key;
        const heading = adminNode("div", "", "workbench-group-heading");
        heading.append(
          adminNode("h3", definition.title),
          adminNode(
            "span",
            String(group.items.length) + (group.has_more ? "+" : ""),
            "account-badge",
          ),
        );
        section.append(
          heading,
          adminNode("p", definition.note, "analytics-note"),
        );
        for (const lead of group.items) {
          const item = adminNode("article", "", "workbench-task");
          item.append(
            adminNode("strong", lead.labels?.plan || "Tư vấn chọn gói"),
          );
          item.append(
            adminNode(
              "p",
              (lead.phone_masked || "Liên hệ đã ẩn") +
                " · " +
                (lead.labels?.assignee || "Chưa phân công"),
            ),
          );
          item.append(
            adminNode(
              "p",
              "Hạn liên hệ: " +
                (lead.sla_due_at
                  ? PageFPTDates.format(lead.sla_due_at)
                  : "Chưa thiết lập"),
              "analytics-note",
            ),
          );
          const link = adminNode("a", definition.action, "btn-action-detail");
          link.href = "/admin/leads/detail?id=" + encodeURIComponent(lead.id);
          item.append(link);
          section.append(item);
        }
        if (!group.items.length)
          section.append(
            adminNode(
              "p",
              "Không có hồ sơ đang chờ trong nhóm này.",
              "analytics-note",
            ),
          );
        const all = adminNode("a", "Xem danh sách", "workbench-all");
        all.href =
          "/admin/leads?" +
          (group.key === "overdue" ? "overdue=true" : "status=" + group.key);
        section.append(all);
        sections.push(section);
      }
      root.replaceChildren(...sections);
      state.textContent = "Cập nhật: " + PageFPTDates.format(data.checked_at);
      return true;
    } catch (error) {
      state.textContent = error.message;
      return false;
    } finally {
      refresh.disabled = false;
      root.removeAttribute("aria-busy");
    }
  }
  let inFlight;
  window.loadWorkbench = () => {
    if (!inFlight)
      inFlight = load().finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  refresh.addEventListener("click", window.loadWorkbench);
  document.addEventListener("admin:data-changed", (event) => {
    if (!event.detail?.workbench_refreshed) window.loadWorkbench();
  });
  window.loadWorkbench();
})();
