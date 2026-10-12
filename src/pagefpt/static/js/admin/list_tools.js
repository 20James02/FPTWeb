/* Stable, typed sorting plus versioned bulk selection. Scope is the loaded/filtered list. */
(() => {
  const collator = new Intl.Collator("vi", {
    numeric: true,
    sensitivity: "base",
  });
  function parsed(value, type) {
    const text = String(value || "")
      .trim()
      .split("\n")[0];
    if (!text || text === "—") return null;
    if (type === "money" || type === "number") {
      const match = text.match(/-?\d[\d.,\s]*/);
      return match ? Number(match[0].replace(/[.,\s]/g, "")) : null;
    }
    if (type === "date") {
      const m = text.match(
        /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[^\d]*(\d{1,2}):(\d{2}))?/,
      );
      const n = m
        ? new Date(
            Number(m[3]),
            Number(m[2]) - 1,
            Number(m[1]),
            Number(m[4] || 0),
            Number(m[5] || 0),
          ).getTime()
        : Date.parse(text);
      return Number.isFinite(n) ? n : null;
    }
    return text;
  }
  function compareValues(a, b, type = "text") {
    const x = parsed(a, type),
      y = parsed(b, type);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return type === "text" ? collator.compare(x, y) : x - y;
  }
  const selections = new Map(),
    bars = new WeakMap();
  function selected(group) {
    if (!selections.has(group)) selections.set(group, new Map());
    return selections.get(group);
  }
  function bindRow(
    row,
    {
      id,
      version,
      kind,
      status,
      group,
      payload,
      planStopped,
      publishedVersion,
    },
  ) {
    row.dataset.bulkId = id;
    row.dataset.bulkVersion = version;
    row.dataset.bulkKind = kind;
    row.dataset.bulkStatus = status || "";
    row.dataset.bulkGroup = group;
    row.dataset.bulkPlanStopped = String(!!planStopped);
    if (publishedVersion != null)
      row.dataset.bulkPublishedVersion = publishedVersion;
    else delete row.dataset.bulkPublishedVersion;
    row.bulkPayload = payload;
  }
  function checkbox(row) {
    if (row.querySelector("[data-bulk-select]")) return;
    const group = row.dataset.bulkGroup,
      id = row.dataset.bulkId;
    if (!group || !id) return;
    const label = document.createElement("label");
    label.className = "admin-check bulk-row-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.bulkSelect = "";
    box.checked = selected(group).has(id);
    box.setAttribute(
      "aria-label",
      "Chọn " + (row.querySelector("h2,h3,strong,a")?.textContent || "bản ghi"),
    );
    box.onchange = () => {
      const map = selected(group);
      box.checked
        ? map.set(id, {
            id,
            version: Number(row.dataset.bulkVersion),
            kind: row.dataset.bulkKind,
            status: row.dataset.bulkStatus,
            planStopped: row.dataset.bulkPlanStopped === "true",
            publishedVersion:
              row.dataset.bulkPublishedVersion == null
                ? null
                : Number(row.dataset.bulkPublishedVersion),
            payload: row.bulkPayload,
          })
        : map.delete(id);
      count(group);
    };
    label.append(box);
    if (row.tagName === "TR") {
      const cell = document.createElement("td");
      cell.dataset.bulkCell = "";
      cell.append(label);
      row.prepend(cell);
    } else row.prepend(label);
  }
  function count(group) {
    document.querySelectorAll("[data-bulk-count]").forEach((el) => {
      if (el.dataset.bulkCount === group)
        if (el.textContent !== `Đã chọn ${selected(group).size}`)
          el.textContent = `Đã chọn ${selected(group).size}`;
    });
    document.querySelectorAll("[data-bulk-container]").forEach((container) => {
      if (
        container.dataset.bulkContainer !== group ||
        container.tagName !== "TBODY"
      )
        return;
      const all = container
        .closest("table")
        ?.querySelector("thead [data-bulk-all]");
      if (!all) return;
      const boxes = [
        ...container.querySelectorAll("[data-bulk-select]"),
      ].filter((box) => box.getClientRects().length && !box.disabled);
      const checked = boxes.filter((box) => box.checked).length;
      all.checked = boxes.length > 0 && checked === boxes.length;
      all.indeterminate = checked > 0 && checked < boxes.length;
      all.disabled = !boxes.length;
    });
  }
  function retainSelection(group, ids) {
    const visible = new Set(ids);
    for (const id of selected(group).keys())
      if (!visible.has(id)) selected(group).delete(id);
    count(group);
  }
  function toolbar(container, group) {
    let bar = bars.get(container);
    if (bar?.isConnected && bar.dataset.bulkToolbar === group) return bar;
    bar?.remove();
    bar = document.createElement("div");
    bar.className = "admin-bulk-toolbar";
    bar.dataset.bulkToolbar = group;
    const all = document.createElement("button");
    all.type = "button";
    all.textContent = "Chọn tất cả đang hiển thị";
    all.onclick = () =>
      container.querySelectorAll("[data-bulk-select]").forEach((box) => {
        if (box.getClientRects().length && !box.disabled && !box.checked) {
          box.checked = true;
          box.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });
    const clear = document.createElement("button");
    clear.type = "button";
    clear.textContent = "Bỏ chọn";
    clear.onclick = () => {
      selected(group).clear();
      container
        .querySelectorAll("[data-bulk-select]")
        .forEach((box) => (box.checked = false));
      count(group);
    };
    const n = document.createElement("span");
    n.dataset.bulkCount = group;
    bar.append(all, clear, n);
    for (const [op, label] of [
      ["publish", "Công bố đã chọn"],
      ["retire", "Ngừng đã chọn"],
      ["replay", "Thử lại đã chọn"],
      ["lock", "Khóa nhân viên đã chọn"],
      ["unlock", "Mở khóa đã chọn"],
    ]) {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = label;
      action.dataset.bulkAction = op;
      action.onclick = () => run(group, op, bar);
      bar.append(action);
    }
    (container.tagName === "TBODY"
      ? container.closest("table")
      : container
    ).before(bar);
    bars.set(container, bar);
    count(group);
    return bar;
  }
  async function run(group, op, bar) {
    const rows = [...selected(group).values()].filter((row) =>
      op === "replay"
        ? row.kind === "jobs" && row.status === "failed"
        : op === "lock" || op === "unlock"
          ? row.kind === "staff"
          : [
              "plans",
              "products",
              "prices",
              "regions",
              "pages",
              "promotions",
              "experiments",
              "campaigns",
              "costs",
              "integrations",
            ].includes(row.kind) &&
            row.status !== "retired" &&
            (op !== "publish" ||
              row.kind !== "prices" ||
              (row.status === "draft" && !row.planStopped)) &&
            (op !== "publish" ||
              row.kind !== "plans" ||
              row.status === "draft" ||
              row.publishedVersion == null ||
              row.version !== row.publishedVersion),
    );
    if (!rows.length) {
      let output = bar.querySelector("[role=status]");
      if (!output) {
        output = document.createElement("p");
        output.setAttribute("role", "status");
        bar.append(output);
      }
      output.textContent =
        "Không có bản ghi phù hợp với thao tác này. Công bố áp dụng cho bản nháp hoặc gói có thay đổi chưa công bố.";
      return;
    }
    const confirmFn =
      typeof adminConfirm === "function"
        ? adminConfirm
        : async (message) => confirm(message);
    if (
      !(await confirmFn(
        `${op === "publish" ? "Công bố" : op === "retire" ? "Ngừng sử dụng" : op === "lock" ? "Khóa tài khoản" : op === "unlock" ? "Mở khóa tài khoản" : "Chạy lại"} ${rows.length} bản ghi đã chọn?`,
      ))
    )
      return;
    bar.querySelectorAll("button").forEach((b) => (b.disabled = true));
    const results = [];
    let index = 0;
    async function worker() {
      while (index < rows.length) {
        const row = rows[index++];
        try {
          const path =
            row.kind === "staff"
              ? "/api/v1/admin/memberships"
              : "/api/v1/admin/" +
                row.kind +
                "/" +
                row.id +
                "/" +
                (op === "replay" ? "replay" : op);
          const r = await adminFetch(path, {
            method: row.kind === "staff" ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              row.kind === "staff"
                ? {
                    ...row.payload,
                    expected_version: row.version,
                    active: op === "unlock",
                  }
                : op === "replay"
                  ? {}
                  : { expected_version: row.version },
            ),
          });
          const d = await r.json();
          if (!r.ok)
            throw Error(
              d.code === "VERSION_CONFLICT"
                ? "Bản ghi đã đổi: bỏ chọn và chọn lại sau khi tải mới."
                : d.code === "PERMISSION_DENIED"
                  ? "Không đủ quyền hoặc MFA."
                  : d.code === "LAST_OWNER_REQUIRED"
                    ? "Phải giữ ít nhất một chủ hệ thống hoạt động."
                    : d.message || d.error || `HTTP ${r.status}`,
            );
          selected(group).delete(row.id);
          document.querySelectorAll("[data-bulk-select]").forEach((box) => {
            if (box.closest("[data-bulk-id]")?.dataset.bulkId === row.id)
              box.checked = false;
          });
          results.push({ id: row.id, ok: true });
        } catch (e) {
          results.push({ id: row.id, ok: false, error: e.message });
        }
      }
    }
    try {
      await Promise.all([worker(), worker()]);
      let output = bar.querySelector("[role=status]");
      if (!output) {
        output = document.createElement("p");
        output.setAttribute("role", "status");
        bar.append(output);
      }
      output.textContent =
        `Thành công ${results.filter((r) => r.ok).length}/${results.length}. ` +
        results
          .filter((r) => !r.ok)
          .map((r) => r.id.slice(0, 8) + ": " + r.error)
          .join(" · ");
      window.dispatchEvent(
        new CustomEvent("pagefpt-admin-bulk-complete", {
          detail: { group, results },
        }),
      );
    } finally {
      bar.querySelectorAll("button").forEach((b) => (b.disabled = false));
      count(group);
    }
  }
  function enhance() {
    for (const [index, table] of [
      ...document.querySelectorAll(".admin-content table"),
    ].entries()) {
      const body = table.tBodies[0];
      if (
        body &&
        body.id !== "crm-table-tbody" &&
        !body.dataset.bulkContainer &&
        !body.querySelector("[data-bulk-id]")
      ) {
        body.dataset.bulkContainer = "table-" + index;
        for (const [i, row] of [...body.rows].entries()) {
          if (row.cells.length > 1)
            bindRow(row, {
              id: "table-" + index + "-" + i,
              version: 0,
              kind: "readonly",
              group: "table-" + index,
            });
        }
      }
    }
    for (const row of document.querySelectorAll("[data-bulk-id]"))
      checkbox(row);
    for (const container of document.querySelectorAll(
      "[data-bulk-container]",
    )) {
      const bar = toolbar(container, container.dataset.bulkContainer),
        kinds = [...container.querySelectorAll("[data-bulk-kind]")].map(
          (r) => r.dataset.bulkKind,
        );
      bar.querySelectorAll("[data-bulk-action]").forEach((btn) => {
        btn.hidden =
          btn.dataset.bulkAction === "replay"
            ? !kinds.includes("jobs")
            : ["lock", "unlock"].includes(btn.dataset.bulkAction)
              ? !kinds.includes("staff")
              : !kinds.some((k) =>
                  (btn.dataset.bulkAction === "publish"
                    ? [
                        "plans",
                        "products",
                        "prices",
                        "regions",
                        "pages",
                        "promotions",
                        "experiments",
                      ]
                    : [
                        "plans",
                        "products",
                        "prices",
                        "regions",
                        "pages",
                        "promotions",
                        "experiments",
                        "campaigns",
                        "costs",
                        "integrations",
                      ]
                  ).includes(k),
                );
      });
    }
    for (const table of document.querySelectorAll(".admin-content table")) {
      const header = table.tHead?.rows[0],
        body = table.tBodies[0];
      if (!header || !body) continue;
      const hasBulk = !!body.querySelector("[data-bulk-id]");
      if (hasBulk && !header.querySelector("[data-bulk-cell]")) {
        const h = document.createElement("th");
        h.dataset.bulkCell = "";
        const selectAll = document.createElement("input");
        selectAll.type = "checkbox";
        selectAll.dataset.bulkAll = "";
        selectAll.setAttribute("aria-label", "Chọn tất cả đang hiển thị");
        selectAll.onchange = () => {
          const checked = selectAll.checked;
          body.querySelectorAll("[data-bulk-select]").forEach((box) => {
            if (
              box.getClientRects().length &&
              !box.disabled &&
              box.checked !== checked
            ) {
              box.checked = checked;
              box.dispatchEvent(new Event("change", { bubbles: true }));
            }
          });
        };
        h.append(selectAll);
        header.prepend(h);
        for (const th of [...header.cells]) {
          if (th.dataset.sortReady !== undefined) {
            th.textContent = th.textContent.replace(/ [↕↑↓]$/, "");
            delete th.dataset.sortReady;
          }
        }
      }
      if (body.dataset.bulkContainer) count(body.dataset.bulkContainer);
      for (const [i, th] of [...header.cells].entries()) {
        if (
          th.dataset.sortReady !== undefined ||
          th.dataset.bulkCell !== undefined ||
          /Thao tác|Hành động/.test(th.textContent)
        )
          continue;
        th.dataset.sortReady = "";
        const title = th.textContent.trim(),
          button = document.createElement("button");
        button.type = "button";
        button.className = "admin-sort-button";
        button.textContent = title + " ↕";
        th.replaceChildren(button);
        button.onclick = () => {
          const ascending = th.getAttribute("aria-sort") !== "ascending";
          [...header.cells].forEach((h) => h.removeAttribute("aria-sort"));
          th.setAttribute("aria-sort", ascending ? "ascending" : "descending");
          const type =
            th.dataset.sortType ||
            (/thời|ngày|hiệu lực/i.test(title)
              ? "date"
              : /cước|tiền|phí|giá|thu|CPL|chi phí/i.test(title)
                ? "money"
                : "text");
          const rows = [...body.rows].filter((r) => r.cells.length > i);
          rows
            .map((row, index) => ({ row, index }))
            .sort(
              (a, b) =>
                (ascending ? 1 : -1) *
                  compareValues(
                    a.row.cells[i].dataset.sortValue ||
                      a.row.cells[i].textContent,
                    b.row.cells[i].dataset.sortValue ||
                      b.row.cells[i].textContent,
                    type,
                  ) || a.index - b.index,
            )
            .forEach((x) => body.append(x.row));
          button.textContent = title + (ascending ? " ↑" : " ↓");
        };
      }
    }
  }
  window.PageFPTAdminLists = {
    compareValues,
    bindRow,
    enhance,
    selected,
    retainSelection,
  };
  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(enhance, 50);
    }).observe(document.querySelector(".admin-content") || document.body, {
      childList: true,
      subtree: true,
    });
  });
})();
