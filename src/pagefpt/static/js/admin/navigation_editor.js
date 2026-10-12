(() => {
  const form = document.getElementById("navigation-form");
  if (!form) return;
  const $ = (id) => document.getElementById(id),
    node = (tag, text, cls) => {
      const el = document.createElement(tag);
      el.textContent = text || "";
      if (cls) el.className = cls;
      return el;
    };
  const presets = {
    custom: "Liên kết tùy chỉnh",
    internet: "Internet (menu có sẵn)",
    play: "FPT Play (menu có sẵn)",
    camera: "Camera (menu có sẵn)",
    "smart-home": "Smart Home",
    speedtest: "Đo tốc độ (đã chuyển dưới slide)",
    promotions: "Khuyến mãi",
  };
  let items = [],
    version = 0,
    busy = true;
  function field(parent, key, label, value, type = "text") {
    const wrap = node("label", label),
      input = document.createElement(type === "select" ? "select" : "input");
    input.dataset.key = key;
    if (type === "select")
      for (const [id, title] of Object.entries(presets)) {
        const o = node("option", title);
        o.value = id;
        input.append(o);
      }
    else {
      input.type = type;
      input.required = type !== "checkbox";
      input.maxLength = key === "href" ? 300 : 40;
      if (type === "checkbox") input.checked = !!value;
    }
    input.value = value ?? "";
    wrap.append(input);
    parent.append(wrap);
    return input;
  }
  const value = (row, key) => row.querySelector(`[data-key=${key}]`).value;
  function read() {
    return [...$("navigation-editor").children].map((row) => ({
      id: row.dataset.id,
      label: value(row, "label"),
      href: value(row, "href"),
      preset: value(row, "preset"),
      enabled: row.querySelector("[data-key=enabled]").checked,
      children: [...row.querySelectorAll(".navigation-child")].map((c) => ({
        label: value(c, "child-label"),
        href: value(c, "child-href"),
      })),
    }));
  }
  function preview() {
    const visible = read().filter(
        (i) =>
          i.enabled &&
          i.preset !== "speedtest" &&
          i.href.split(/[?#]/)[0].replace(/\/$/, "") !== "/do-toc-do",
      ),
      box = $("navigation-preview");
    box.replaceChildren();
    for (const i of visible) {
      const group = node("div", "", "navigation-preview-group");
      group.append(node("strong", i.label || "Tên menu"));
      group.append(node("small", i.href));
      if (i.children.length)
        for (const c of i.children.filter(
          (c) => c.href.split(/[?#]/)[0].replace(/\/$/, "") !== "/do-toc-do",
        ))
          group.append(node("span", c.label || "Mục con"));
      else if (["internet", "play", "camera"].includes(i.preset))
        group.append(node("span", "Nhóm dịch vụ + thẻ tư vấn minh họa"));
      box.append(group);
    }
    if (!visible.length) box.append(node("p", "Chưa có mục đang bật."));
  }
  function action(parent, label, fn, disabled = false) {
    const b = node("button", label, "pricing-btn");
    b.type = "button";
    b.disabled = disabled;
    b.onclick = fn;
    parent.append(b);
  }
  function render() {
    $("navigation-editor").replaceChildren();
    items.forEach((item, index) => {
      const row = node("article", "", "workspace-item navigation-row");
      row.dataset.id = item.id;
      const head = node("div", "", "editor-toolbar");
      head.append(node("h3", `${index + 1}. ${item.label || "Menu mới"}`));
      action(
        head,
        "↑",
        () => {
          items = read();
          [items[index - 1], items[index]] = [items[index], items[index - 1]];
          render();
        },
        index === 0,
      );
      action(
        head,
        "↓",
        () => {
          items = read();
          [items[index + 1], items[index]] = [items[index], items[index + 1]];
          render();
        },
        index === items.length - 1,
      );
      action(head, "Xóa", async () => {
        if (
          await adminConfirm(
            "Xóa mục này khỏi bản đang chỉnh? Bấm Lưu menu để áp dụng.",
          )
        ) {
          items = read();
          items.splice(index, 1);
          render();
        }
      });
      row.append(head);
      const grid = node("div", "", "admin-form-grid");
      field(grid, "label", "Tên menu", item.label);
      field(grid, "href", "Đường dẫn khi mở", item.href);
      field(grid, "preset", "Kiểu menu", item.preset, "select");
      field(grid, "enabled", "Hiển thị", item.enabled, "checkbox");
      row.append(grid);
      if (item.preset === "speedtest")
        row.append(
          node(
            "p",
            "Đo tốc độ đã chuyển xuống dưới slide trang chủ; mục này không hiện trong navbar.",
            "pricing-hint",
          ),
        );
      const children = node("div", "", "navigation-children");
      item.children.forEach((c, ci) => {
        const child = node("div", "", "navigation-child admin-form-grid");
        field(child, "child-label", "Tên mục con", c.label);
        field(child, "child-href", "Đường dẫn mục con", c.href);
        action(child, "Xóa mục con", () => {
          items = read();
          items[index].children.splice(ci, 1);
          render();
        });
        children.append(child);
      });
      row.append(children);
      action(
        row,
        "+ Thêm mục con",
        () => {
          items = read();
          items[index].children.push({ label: "", href: "/" });
          render();
        },
        item.children.length >= 12,
      );
      $("navigation-editor").append(row);
    });
    $("navigation-add").disabled = busy || items.length >= 12;
    preview();
  }
  async function load() {
    busy = true;
    $("navigation-save").disabled = true;
    $("navigation-add").disabled = true;
    try {
      const r = await adminFetch("/api/v1/system/display-settings");
      if (!r.ok) throw Error("Chưa tải được menu.");
      const data = await r.json();
      items = data.navigation_items;
      version = data.version;
      busy = false;
      render();
      $("navigation-state").textContent =
        "Đã tải bản lưu. Thay đổi chỉ áp dụng khi bấm Lưu menu.";
      $("navigation-save").disabled = false;
    } catch (e) {
      $("navigation-state").textContent = e.message;
    }
  }
  form.addEventListener("input", preview);
  form.addEventListener("change", preview);
  $("navigation-add").onclick = () => {
    if (busy) return;
    items = read();
    items.push({
      id: "menu-" + crypto.randomUUID().slice(0, 8),
      label: "",
      href: "/",
      preset: "custom",
      enabled: true,
      children: [],
    });
    render();
    $("navigation-editor").lastElementChild.querySelector("input").focus();
  };
  $("navigation-reload").onclick = async () => {
    if (
      await adminConfirm(
        "Tải lại bản đã lưu? Thay đổi chưa lưu trong form sẽ được thay thế.",
      )
    )
      load();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $("navigation-save").disabled = true;
    $("navigation-add").disabled = true;
    try {
      const r = await adminFetch("/api/v1/system/display-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: version,
          navigation_items: read(),
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw Error(
          data.code === "VERSION_CONFLICT"
            ? "Cấu hình vừa thay đổi. Tải lại bản đã lưu rồi chỉnh sửa."
            : data.code === "VALIDATION_ERROR"
              ? "Kiểm tra tên, liên kết HTTPS/đường dẫn nội bộ và nhóm menu không trùng."
              : "Chưa lưu được. Kiểm tra quyền và MFA.",
        );
      version = data.settings.version;
      $("navigation-state").textContent =
        "Đã lưu. Menu trên website đã cập nhật.";
      showToast("Đã lưu menu.", "success");
    } catch (err) {
      $("navigation-state").textContent = err.message;
    } finally {
      busy = false;
      $("navigation-save").disabled = false;
      $("navigation-add").disabled = items.length >= 12;
    }
  };
  load();
})();
