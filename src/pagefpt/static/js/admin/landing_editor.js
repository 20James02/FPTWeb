/* PageFPT Admin Landing Page Studio: Typed section editor & Live preview */
(() => {
  const $ = (id) => document.getElementById(id),
    defaults = JSON.parse($("landing-defaults").textContent);
  let row = null,
    draft = null,
    plans = [],
    pages = [],
    sequence = 0,
    timer,
    previewSeq = 0,
    previewController = null,
    dirty = false,
    historyStack = [],
    historyIdx = -1,
    isUndoing = false;

  const uploads = new Map();
  const saves = new Set();
  const pendingUploads = () => uploads.get(sequence) || 0;
  const node = (tag, text = "", cls = "") => {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const button = (label, action, cls = "pricing-btn") => {
    const e = node("button", label, cls);
    e.type = "button";
    e.onclick = (event) => {
      if (pendingUploads())
        return showError(
          "Đợi ảnh tải xong trước khi đổi cấu trúc hoặc danh sách.",
        );
      return action(event);
    };
    return e;
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function updateDirtyState(isDirty) {
    dirty = isDirty;
    const badge = $("lp-admin-dirty-badge");
    if (badge) badge.hidden = !dirty;
  }

  function pushHistory() {
    if (isUndoing || !draft) return;
    const snap = clone(draft);
    if (JSON.stringify(historyStack[historyIdx]) === JSON.stringify(snap))
      return;
    if (historyIdx < historyStack.length - 1) {
      historyStack = historyStack.slice(0, historyIdx + 1);
    }
    historyStack.push(snap);
    if (historyStack.length > 35) historyStack.shift();
    else historyIdx++;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    const uBtn = $("lp-admin-undo"),
      rBtn = $("lp-admin-redo");
    if (uBtn) uBtn.disabled = historyIdx <= 0;
    if (rBtn) rBtn.disabled = historyIdx >= historyStack.length - 1;
  }

  function undo() {
    if (!draft || $("lp-admin-editor").hidden) return;
    if (pendingUploads())
      return showError("Đợi ảnh tải xong trước khi hoàn tác.");
    if (historyIdx > 0) {
      isUndoing = true;
      historyIdx--;
      draft = clone(historyStack[historyIdx]);
      updateDirtyState(true);
      renderFields();
      queuePreview();
      isUndoing = false;
      updateHistoryButtons();
    }
  }

  function redo() {
    if (!draft || $("lp-admin-editor").hidden) return;
    if (pendingUploads())
      return showError("Đợi ảnh tải xong trước khi làm lại.");
    if (historyIdx < historyStack.length - 1) {
      isUndoing = true;
      historyIdx++;
      draft = clone(historyStack[historyIdx]);
      updateDirtyState(true);
      renderFields();
      queuePreview();
      isUndoing = false;
      updateHistoryButtons();
    }
  }

  async function request(path, method = "GET", data) {
    const r = await adminFetch("/api/v1" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await r.json();
    if (!r.ok) {
      const fields = Object.keys(body.fields || {}).join(", ");
      throw Error(
        r.status === 409
          ? "Dữ liệu đã thay đổi. Tải lại trang trước khi lưu; bản đang nhập vẫn được giữ."
          : r.status === 403
            ? "Tài khoản chưa có quyền thực hiện hoặc cần xác minh MFA."
            : r.status === 422
              ? "Kiểm tra thông tin bắt buộc, ảnh và liên kết." +
                (fields ? " Trường: " + fields : "")
              : body.error || "Chưa hoàn tất thao tác. Vui lòng thử lại.",
      );
    }
    return body;
  }

  function value(path) {
    return path.split(".").reduce((v, k) => v?.[k], draft);
  }

  function set(path, v) {
    patch({ [path]: v });
  }

  function patch(values) {
    for (const [path, v] of Object.entries(values)) {
      const parts = path.split("."),
        last = parts.pop();
      parts.reduce((val, k) => val[k], draft)[last] = v;
    }
    updateDirtyState(true);
    pushHistory();
    queuePreview();
  }

  function field(
    parent,
    path,
    label,
    type = "text",
    choices,
    required = false,
    transform = null,
  ) {
    const wrap = node("label", label, "lp-admin-field"),
      el = node(
        type === "textarea"
          ? "textarea"
          : type === "select"
            ? "select"
            : "input",
      );
    if (el.tagName === "INPUT") el.type = type;
    el.dataset.path = path;
    el.setAttribute("aria-label", label);
    if (choices)
      for (const [v, text] of choices) {
        const o = node("option", text);
        o.value = v;
        el.append(o);
      }
    el.value =
      type === "datetime-local" && value(path)
        ? new Date(
            Date.parse(value(path)) -
              new Date(value(path)).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : (value(path) ?? "");
    el.required = required;
    if (type === "number") {
      el.min = 1;
      el.max = 5;
    }
    const max = path.endsWith("description")
      ? 300
      : path.endsWith("slug")
        ? 100
        : path.endsWith("quote")
          ? 500
          : path.endsWith("answer")
            ? 1200
            : path.endsWith("features")
              ? 1300
              : path.endsWith("footer_text")
                ? 800
                : 500;
    if (["text", "textarea"].includes(type)) el.maxLength = max;
    el.addEventListener(type === "select" ? "change" : "input", () =>
      set(
        path,
        transform
          ? transform(el.value)
          : type === "number" ||
              (type === "select" &&
                path.match(/billing_months|desktop_columns/))
            ? Number(el.value)
            : type === "datetime-local"
              ? el.value
                ? new Date(el.value).toISOString()
                : null
              : el.value,
      ),
    );
    wrap.append(el);
    parent.append(wrap);
    return el;
  }

  function check(parent, path, label) {
    const wrap = node("label", "", "lp-admin-check"),
      el = node("input");
    el.type = "checkbox";
    el.checked = !!value(path);
    el.dataset.path = path;
    el.onchange = () => {
      set(path, el.checked);
      updateSidebarNav();
    };
    wrap.append(el, node("span", label));
    parent.append(wrap);
  }

  function section(title, open = false, id = "") {
    const d = node("details", "", "lp-admin-section");
    d.open = open;
    if (id) d.dataset.sectionId = id;
    d.append(node("summary", title));
    $("lp-admin-fields").append(d);
    return d;
  }

  const icons = [
    ["speed", "Tốc độ"],
    ["wifi", "Wi-Fi"],
    ["support", "Hỗ trợ"],
    ["install", "Lắp đặt"],
    ["play", "Truyền hình"],
    ["camera", "Camera"],
    ["users", "Khách hàng"],
    ["building", "Địa bàn"],
    ["award", "Giải thưởng"],
    ["shield", "Bảo vệ"],
  ];

  function photo(parent, path, label) {
    const wrap = node("div", "", "lp-admin-photo");
    wrap.append(node("b", label));
    const image = node("img"),
      urlPath = path.replace(/_id$/, "_url");
    image.alt = label;
    if (value(urlPath)) image.src = value(urlPath);
    image.hidden = !value(urlPath);
    wrap.append(image);
    const input = node("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("aria-label", "Tải " + label);
    wrap.append(input);
    const status = node("small", "JPEG / PNG / WebP · Tối đa 10 MB");
    status.setAttribute("role", "status");
    wrap.append(status);
    input.onchange = async () => {
      const file = input.files[0],
        seq = sequence;
      if (!file) return;
      uploads.set(seq, (uploads.get(seq) || 0) + 1);
      $("lp-admin-save").disabled = true;
      input.disabled = true;
      remove.disabled = true;
      status.textContent = "Đang tải & xử lý ảnh…";
      try {
        const asset = await adminUploadImage(file);
        if (seq !== sequence || !wrap.isConnected) return;
        patch({ [path]: asset.id, [urlPath]: asset.payload.url });
        image.src = asset.payload.url;
        image.hidden = false;
        status.textContent = "Ảnh sẵn sàng · Lưu bản nháp để áp dụng";
      } catch (e) {
        if (seq === sequence) status.textContent = e.message;
      } finally {
        const pending = (uploads.get(seq) || 1) - 1;
        if (pending) uploads.set(seq, pending);
        else uploads.delete(seq);
        if (seq === sequence) {
          input.disabled = false;
          remove.disabled = false;
          $("lp-admin-save").disabled = pendingUploads() > 0 || saves.has(seq);
          queuePreview();
        }
      }
    };
    const remove = button("Bỏ ảnh", () => {
      patch({ [path]: null, [urlPath]: "" });
      image.hidden = true;
      image.removeAttribute("src");
      input.value = "";
    });
    wrap.append(remove);
    parent.append(wrap);
  }

  function repeat(parent, path, label, fields, initial, max) {
    parent.append(node("h3", label));
    const list = node("div");
    parent.append(list);
    const render = () => {
      list.replaceChildren();
      value(path).forEach((item, i) => {
        const card = node("div", "", "lp-admin-repeat-row");
        for (const f of fields)
          field(
            card,
            path + "." + i + "." + f[0],
            f[1],
            f[2] || "text",
            f[3],
            !["text", "location"].includes(f[0]),
          );
        if (path === "landing.reviews")
          photo(card, path + "." + i + ".avatar_image_id", "Ảnh khách hàng");
        const actions = node("div", "", "lp-admin-repeat-actions");
        actions.append(
          button("↑", () => {
            if (i) {
              const v = value(path);
              [v[i - 1], v[i]] = [v[i], v[i - 1]];
              updateDirtyState(true);
              pushHistory();
              render();
              queuePreview();
            }
          }),
          button("↓", () => {
            const v = value(path);
            if (i < v.length - 1) {
              [v[i + 1], v[i]] = [v[i], v[i + 1]];
              updateDirtyState(true);
              pushHistory();
              render();
              queuePreview();
            }
          }),
          button("Xóa", () => {
            value(path).splice(i, 1);
            updateDirtyState(true);
            pushHistory();
            render();
            queuePreview();
          }),
        );
        card.append(actions);
        list.append(card);
      });
    };
    render();
    parent.append(
      button("+ Thêm " + label.toLowerCase(), () => {
        if (value(path).length >= max)
          return showError("Tối đa " + max + " mục.");
        value(path).push(clone(initial));
        updateDirtyState(true);
        pushHistory();
        render();
        queuePreview();
      }),
    );
  }

  function showError(text) {
    $("lp-admin-error").textContent = text;
  }

  /* Templates change presentation only. Real offers, schedules and stock stay untouched. */
  const presetContent = {
    family: {
      name: "Combo Gia đình",
      theme: "fpt_standard",
      title: "Internet cho cả gia đình",
      highlight: "Chọn gói phù hợp nhu cầu",
      subtitle:
        "Tư vấn kết nối cho học tập, làm việc và giải trí tại địa chỉ lắp đặt.",
      form: "TƯ VẤN INTERNET GIA ĐÌNH",
      cta: "Nhận tư vấn gia đình",
    },
    sport: {
      name: "Internet & FPT Play",
      theme: "orange_vibrant",
      title: "Internet và FPT Play",
      highlight: "Giải trí theo gói bạn chọn",
      subtitle:
        "Nội dung, thiết bị và quyền xem được xác nhận theo gói và kỳ thanh toán.",
      form: "TƯ VẤN COMBO INTERNET & TRUYỀN HÌNH",
      cta: "Tư vấn Combo",
    },
    camera: {
      name: "Camera An ninh",
      theme: "blue_trust",
      title: "Internet và Camera cho ngôi nhà",
      highlight: "Chọn thiết bị theo nhu cầu",
      subtitle:
        "Tư vấn vị trí lắp, kết nối và chi phí thiết bị theo địa bàn thực tế.",
      form: "NHẬN TƯ VẤN LẮP CAMERA",
      cta: "Nhận báo giá Camera",
    },
    gamer: {
      name: "Game & Doanh nghiệp",
      theme: "modern_dark",
      title: "Kết nối cho game và công việc",
      highlight: "Tư vấn tốc độ và thiết bị",
      subtitle:
        "Lựa chọn băng thông theo gói đã công bố và điều kiện hạ tầng tại nơi lắp đặt.",
      form: "TƯ VẤN KẾT NỐI THEO NHU CẦU",
      cta: "Tư vấn gói phù hợp",
    },
    megasale: {
      name: "Chiến dịch ưu đãi",
      theme: "orange_vibrant",
      title: "Tìm ưu đãi phù hợp với bạn",
      highlight: "Xem giá và điều kiện áp dụng",
      subtitle:
        "Ưu đãi được xác nhận theo gói, địa bàn và kỳ thanh toán đã thiết lập.",
      form: "NHẬN TƯ VẤN ƯU ĐÃI",
      cta: "Tư vấn ưu đãi",
    },
  };
  const PRESETS = Object.fromEntries(
    Object.entries(presetContent).map(([key, copy]) => [
      key,
      {
        name: copy.name,
        apply: (d) => {
          d.landing.theme_preset = copy.theme;
          d.landing.theme_radius = "rounded";
          d.landing.hero_eyebrow = "TƯ VẤN DỊCH VỤ FPT TELECOM";
          d.landing.hero_title = copy.title;
          d.landing.hero_highlight = copy.highlight;
          d.landing.hero_subtitle = copy.subtitle;
          d.landing.form_title = copy.form;
          d.landing.form_subtitle =
            "Giá, thiết bị và lịch lắp được xác nhận khi tư vấn";
          d.landing.form_cta = copy.cta;
          d.landing.cta_label = copy.cta;
          if (key === "camera")
            d.landing.faqs = [
              {
                question: "Gói nào được nhận ưu đãi camera?",
                answer:
                  "Nhân viên kiểm tra gói, kỳ thanh toán và điều kiện chiến dịch tại địa chỉ lắp đặt trước khi xác nhận quà.",
              },
              {
                question: "Có phí lắp đặt hoặc lưu trữ camera không?",
                answer:
                  "Chi phí thiết bị, lắp đặt, VAT và lưu trữ (nếu có) được thể hiện trong báo giá trước khi đăng ký.",
              },
              {
                question: "Gửi thông tin có giữ suất ưu đãi không?",
                answer:
                  "Gửi form là yêu cầu tư vấn. Suất ưu đãi chỉ được xác nhận khi nhân viên chốt điều kiện và lịch lắp đặt.",
              },
            ];
        },
      },
    ]),
  );

  /* Sidebar Block Navigator Synchronizer with Drag-and-Drop */
  let draggedBlockIdx = null;

  function updateSidebarNav() {
    const list = $("lp-sidebar-blocks");
    if (!list) return;
    list.replaceChildren();

    const blockMetadata = {
      hero: {
        name: "1. Banner chính & Form",
        icon: "🚀",
        toggle: null,
        secIdx: 0,
      },
      campaign: {
        name: "2. Flash Sale & Đếm ngược",
        icon: "⏱️",
        toggle: "landing.campaign.enabled",
        secIdx: 3,
      },
      plans: {
        name: "3. Bảng gói cước & Giá",
        icon: "💳",
        toggle: null,
        secIdx: 2,
      },
      compare: {
        name: "4. So sánh thông số",
        icon: "📊",
        toggle: "landing.show_comparison",
        secIdx: 2,
      },
      promo: {
        name: "5. Quà tặng & Ưu đãi",
        icon: "🎁",
        toggle: "landing.show_promo",
        secIdx: 3,
      },
      benefits: {
        name: "6. Lợi ích & Quy trình",
        icon: "⭐",
        toggle: "landing.show_benefits",
        secIdx: 4,
      },
      stats: {
        name: "7. Con số thành tựu",
        icon: "📈",
        toggle: "landing.show_stats",
        secIdx: 4,
      },
      reviews: {
        name: "8. Đánh giá khách hàng",
        icon: "💬",
        toggle: "landing.show_reviews",
        secIdx: 5,
      },
      faq: {
        name: "9. Hỏi đáp thường gặp",
        icon: "❓",
        toggle: "landing.show_faq",
        secIdx: 5,
      },
      closing: {
        name: "10. Form chốt cuối trang",
        icon: "📝",
        toggle: "landing.show_closing",
        secIdx: 6,
      },
    };

    const currentOrder =
      Array.isArray(draft.landing?.section_order) &&
      draft.landing.section_order.length
        ? draft.landing.section_order
        : [
            "hero",
            "campaign",
            "plans",
            "compare",
            "promo",
            "benefits",
            "stats",
            "reviews",
            "faq",
            "closing",
          ];

    currentOrder.forEach((blockKey, idx) => {
      const meta = blockMetadata[blockKey] || {
        name: blockKey,
        icon: "📄",
        toggle: null,
        secIdx: 0,
      };
      const row = node("div", "", "lp-sidebar-item");
      row.draggable = true;
      row.dataset.blockKey = blockKey;
      row.dataset.idx = String(idx);

      const handle = node("span", "⋮⋮", "lp-sidebar-drag-handle");
      handle.title = "Kéo thả để sắp xếp";

      const label = node(
        "span",
        `${meta.icon} ${meta.name}`,
        "lp-sidebar-item-label",
      );

      const reorderBtns = node("div", "", "lp-sidebar-reorder-btns");
      if (idx > 0) {
        const upBtn = node("button", "↑", "lp-btn-arrow");
        upBtn.type = "button";
        upBtn.title = "Di chuyển lên trên";
        upBtn.onclick = (e) => {
          e.stopPropagation();
          if (pendingUploads())
            return showError("Đợi ảnh tải xong trước khi đổi thứ tự.");
          const temp = currentOrder[idx];
          currentOrder[idx] = currentOrder[idx - 1];
          currentOrder[idx - 1] = temp;
          draft.landing.section_order = currentOrder;
          pushHistory();
          updateDirtyState(true);
          updateSidebarNav();
          queuePreview();
        };
        reorderBtns.append(upBtn);
      }
      if (idx < currentOrder.length - 1) {
        const downBtn = node("button", "↓", "lp-btn-arrow");
        downBtn.type = "button";
        downBtn.title = "Di chuyển xuống dưới";
        downBtn.onclick = (e) => {
          e.stopPropagation();
          if (pendingUploads())
            return showError("Đợi ảnh tải xong trước khi đổi thứ tự.");
          const temp = currentOrder[idx];
          currentOrder[idx] = currentOrder[idx + 1];
          currentOrder[idx + 1] = temp;
          draft.landing.section_order = currentOrder;
          pushHistory();
          updateDirtyState(true);
          updateSidebarNav();
          queuePreview();
        };
        reorderBtns.append(downBtn);
      }

      row.onclick = () => {
        const secs = [...document.querySelectorAll(".lp-admin-section")];
        const target = secs.find(
          (section) =>
            section.dataset.sectionId ===
            {
              hero: "s-info",
              campaign: "s-campaign",
              plans: "s-plans",
              compare: "s-plans",
              promo: "s-campaign",
              benefits: "s-benefits",
              stats: "s-benefits",
              reviews: "s-reviews",
              faq: "s-reviews",
              closing: "s-contact",
            }[blockKey],
        );
        if (target) {
          target.open = true;
          target.scrollIntoView({ block: "start", behavior: "smooth" });
          [...document.querySelectorAll(".lp-admin-section")].forEach((s) =>
            s.classList.remove("lp-highlight-pulse"),
          );
          target.classList.remove("lp-highlight-pulse");
          void target.offsetWidth;
          target.classList.add("lp-highlight-pulse");
          setTimeout(() => target.classList.remove("lp-highlight-pulse"), 1600);
          [...document.querySelectorAll(".lp-sidebar-item")].forEach((el) =>
            el.classList.remove("active"),
          );
          row.classList.add("active");
        }
      };

      row.ondragstart = (e) => {
        draggedBlockIdx = idx;
        row.classList.add("is-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", blockKey);
      };

      row.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) {
          row.classList.add("drop-above");
          row.classList.remove("drop-below");
        } else {
          row.classList.add("drop-below");
          row.classList.remove("drop-above");
        }
      };

      row.ondragleave = () => {
        row.classList.remove("drop-above", "drop-below");
      };

      row.ondrop = (e) => {
        e.preventDefault();
        row.classList.remove("drop-above", "drop-below");
        if (draggedBlockIdx === null || draggedBlockIdx === idx) return;
        if (pendingUploads())
          return showError("Đợi ảnh tải xong trước khi đổi thứ tự.");
        const movedItem = currentOrder.splice(draggedBlockIdx, 1)[0];
        currentOrder.splice(idx, 0, movedItem);
        draft.landing.section_order = currentOrder;
        draggedBlockIdx = null;
        pushHistory();
        updateDirtyState(true);
        updateSidebarNav();
        queuePreview();
      };

      row.ondragend = () => {
        row.classList.remove("is-dragging", "drop-above", "drop-below");
        draggedBlockIdx = null;
      };

      row.append(handle, label);

      if (meta.toggle) {
        const toggleWrap = node("label", "", "lp-sidebar-switch");
        toggleWrap.title = "Bật / Tắt hiển thị";
        const chk = node("input");
        chk.type = "checkbox";
        chk.setAttribute("aria-label", "Hiển thị " + meta.name);
        chk.checked = !!value(meta.toggle);
        chk.onclick = (e) => e.stopPropagation();
        chk.onchange = () => {
          if (pendingUploads()) {
            chk.checked = !!value(meta.toggle);
            return showError("Đợi ảnh tải xong trước khi đổi cấu trúc.");
          }
          set(meta.toggle, chk.checked);
          renderFields();
        };
        const slider = node("span", "", "lp-sidebar-switch-slider");
        toggleWrap.append(chk, slider);
        row.append(toggleWrap);
      }

      row.append(reorderBtns);
      list.append(row);
    });
  }

  function renderFields() {
    $("lp-admin-fields").replaceChildren();
    const intro = node("div", "", "lp-admin-quick");
    intro.append(
      node("b", "Bắt đầu trong 3 bước"),
      node(
        "p",
        "1. Chọn mẫu hoặc điền tiêu đề → 2. Chọn gói và giá riêng → 3. Lưu bản nháp, xem trước rồi công bố.",
      ),
    );
    const nav = node("div");
    for (const [index, label] of [
      [0, "Nội dung"],
      [1, "Giao diện"],
      [2, "Gói & giá"],
      [3, "Ưu đãi"],
      [6, "Liên hệ & footer"],
    ])
      nav.append(
        button(label, () => {
          const sections = [...document.querySelectorAll(".lp-admin-section")];
          const section = sections[index];
          if (section) {
            section.open = true;
            section.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }),
      );
    intro.append(
      nav,
      button("Dùng nội dung mẫu chiến dịch Camera", () => {
        if (
          !confirm(
            "Thay tiêu đề, ưu đãi và FAQ bằng mẫu Camera? Giá, gói, liên hệ và ảnh hiện có được giữ.",
          )
        )
          return;
        PRESETS.camera.apply(draft);
        updateDirtyState(true);
        pushHistory();
        renderFields();
        queuePreview();
      }),
    );
    $("lp-admin-fields").append(intro);

    // SECTION 1: Thông tin trang
    let s = section("1. Thông tin trang & nội dung đầu trang", true, "s-info"),
      grid = node("div", "", "admin-form-grid");
    s.append(grid);
    field(grid, "title", "Tên trang", "text", null, true);
    field(
      grid,
      "slug",
      "Đường dẫn · không dấu, dùng dấu gạch ngang",
      "text",
      null,
      true,
    );
    field(s, "description", "Mô tả tìm kiếm", "textarea");
    for (const [key, label] of [
      ["hero_eyebrow", "Dòng giới thiệu"],
      ["hero_title", "Tiêu đề chính"],
      ["hero_highlight", "Dòng nhấn mạnh"],
      ["hero_subtitle", "Mô tả đầu trang"],
      ["form_title", "Tiêu đề form"],
      ["form_subtitle", "Mô tả form"],
      ["form_cta", "Nút nhận tư vấn"],
      ["form_privacy", "Thông tin sử dụng dữ liệu"],
      ["cta_label", "Nhãn nút đăng ký"],
    ])
      field(s, "landing." + key, label);
    photo(s, "landing.hero_image_id", "Ảnh nền desktop");
    photo(s, "landing.hero_mobile_image_id", "Ảnh nền mobile (tùy chọn)");
    repeat(
      s,
      "landing.hero_features",
      "Điểm nổi bật",
      [
        ["title", "Tiêu đề"],
        ["text", "Mô tả"],
        ["icon", "Biểu tượng", "select", icons],
      ],
      { title: "Điểm nổi bật", text: "", icon: "wifi" },
      6,
    );

    // SECTION 1B: Giao diện & Theme Presets
    s = section("🎨 Tùy biến giao diện & Theme Tokens", false, "s-theme");
    grid = node("div", "", "admin-form-grid");
    s.append(grid);
    field(grid, "landing.theme_preset", "Preset màu chủ đạo", "select", [
      ["fpt_standard", "FPT Tiêu chuẩn (Xanh công nghệ & Cam nhiệt huyết)"],
      ["blue_trust", "Xanh Tin cậy (Deep Navy Blue chuyên nghiệp)"],
      ["orange_vibrant", "Cam Bùng nổ (Campaign & Flash Sale rực rỡ)"],
      [
        "modern_dark",
        "Tối Pro Sang trọng (Tech Dark cho Gamer & Doanh nghiệp)",
      ],
      ["emerald_fresh", "Xanh Ngọc Thân thiện (Trẻ trung & Tươi mới)"],
    ]);
    field(grid, "landing.theme_radius", "Độ bo góc thành phần", "select", [
      ["rounded", "Bo góc tiêu chuẩn (14px)"],
      ["soft", "Bo góc mềm mại (20px)"],
      ["pill", "Bo góc tròn hoàn toàn (Pill 28px)"],
    ]);
    field(grid, "landing.hero_layout", "Bố cục đầu trang", "select", [
      ["split", "Nội dung và form cạnh nhau"],
      ["centered", "Nội dung và form căn giữa"],
      ["minimal", "Gọn: tiêu đề và form"],
    ]);
    field(grid, "landing.plans_layout", "Bố cục danh sách gói", "select", [
      ["grid", "Lưới desktop · Trượt trên điện thoại"],
      ["carousel", "Thẻ trượt ở mọi màn hình"],
      ["list", "Danh sách dọc"],
    ]);

    // SECTION 2: Gói cước & bố cục
    s = section("2. Gói cước & bố cục", false, "s-plans");
    field(s, "landing.plans_title", "Tiêu đề mục gói");
    field(s, "landing.plans_subtitle", "Mô tả mục gói");
    field(s, "landing.desktop_columns", "Số cột desktop", "select", [
      [0, "Tự động (3–6 cột)"],
      [3, "3 cột"],
      [4, "4 cột"],
      [5, "5 cột"],
      [6, "6 cột"],
    ]);
    field(s, "landing.billing_months", "Kỳ thanh toán mặc định", "select", [
      [1, "Hàng tháng"],
      [6, "6 tháng"],
      [12, "12 tháng"],
    ]);
    s.append(
      node(
        "p",
        "Tích chọn gói muốn bán. Mở Tùy chỉnh để đổi nhãn hoặc giá riêng. Giá trống sẽ dùng bảng giá theo địa bàn.",
        "lp-admin-field-help",
      ),
    );

    // Plan Filter / Search Tool
    const planToolbar = node("div", "", "lp-admin-plan-toolbar");
    const planSearch = node("input", "", "lp-admin-plan-search");
    planSearch.type = "search";
    planSearch.placeholder = "🔍 Tìm kiếm gói theo tên, tốc độ...";
    planSearch.setAttribute("aria-label", "Tìm kiếm gói cước");
    planToolbar.append(planSearch);

    const filterChips = node("div", "", "lp-admin-plan-filter-chips");
    const chips = [
      ["all", "Tất cả"],
      ["selected", "Đã chọn"],
      ["internet", "Internet"],
      ["combo", "Combo TV"],
      ["camera", "Camera"],
    ];
    let currentPlanFilter = "all";
    chips.forEach(([k, label]) => {
      const chip = node(
        "button",
        label,
        "lp-plan-filter-chip" + (k === "all" ? " active" : ""),
      );
      chip.type = "button";
      chip.onclick = () => {
        currentPlanFilter = k;
        filterChips
          .querySelectorAll(".lp-plan-filter-chip")
          .forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        filterPlansList();
      };
      filterChips.append(chip);
    });
    planToolbar.append(filterChips);
    s.append(planToolbar);

    const plansContainer = node("div", "", "lp-admin-plans-container");
    s.append(plansContainer);

    const known = new Set(plans.map((p) => p.id));
    const allAvailablePlans = [
      ...plans,
      ...draft.landing.plan_ids
        .filter((id) => !known.has(id))
        .map((id) => ({ id, name: "Gói chưa công bố / đã ngừng · " + id })),
    ];

    function filterPlansList() {
      const q = planSearch.value.toLowerCase().trim();
      allAvailablePlans.forEach((plan) => {
        const box = plansContainer.querySelector(
          `[data-plan-box="${plan.id}"]`,
        );
        if (!box) return;
        const isChecked = draft.landing.plan_ids.includes(plan.id);
        const nameMatch = (plan.name || "").toLowerCase().includes(q);
        let catMatch = true;
        if (currentPlanFilter === "selected") catMatch = isChecked;
        else if (currentPlanFilter === "internet")
          catMatch = plan.service === "internet";
        else if (currentPlanFilter === "combo")
          catMatch = ["combo", "play"].includes(plan.service);
        else if (currentPlanFilter === "camera")
          catMatch = plan.service === "camera";
        box.hidden = !(nameMatch && catMatch);
      });
    }
    planSearch.oninput = filterPlansList;

    for (const plan of allAvailablePlans) {
      const box = node("div", "", "lp-admin-plan");
      box.dataset.planBox = plan.id;
      if (draft.landing.plan_ids.includes(plan.id))
        box.classList.add("selected");
      const label = node("label", "", "lp-admin-check"),
        input = node("input");
      input.type = "checkbox";
      input.checked = draft.landing.plan_ids.includes(plan.id);
      input.dataset.landingPlan = plan.id;
      input.onchange = () => {
        const ids = new Set(draft.landing.plan_ids);
        input.checked ? ids.add(plan.id) : ids.delete(plan.id);
        if (ids.size > 24) {
          input.checked = false;
          return showError("Tối đa 24 gói trên một landing page.");
        }
        draft.landing.plan_ids = [...ids];
        box.classList.toggle("selected", input.checked);
        updateDirtyState(true);
        pushHistory();
        queuePreview();
      };
      label.append(input, node("span", plan.name));
      box.append(label);

      let presentation = draft.landing.plan_presentations.find(
        (p) => p.plan_id === plan.id,
      );
      if (!presentation && known.has(plan.id)) {
        presentation = {
          card_labels: {},
          campaign_prices: [],
          plan_id: plan.id,
          subtitle: "",
          badge: "",
          accent: "blue",
          features: [],
        };
        draft.landing.plan_presentations.push(presentation);
      }
      if (presentation) {
        const index = draft.landing.plan_presentations.indexOf(presentation),
          path = "landing.plan_presentations." + index,
          details = node("details");
        presentation.card_labels ||= {};
        presentation.campaign_prices ||= [];
        details.append(node("summary", "Tùy chỉnh thẻ & giá riêng"));
        details.append(
          node(
            "p",
            "Mặc định kế thừa trang chủ. Chỉ nhập mục muốn thay đổi trên landing này.",
            "lp-admin-field-help",
          ),
        );
        for (const [key, fieldLabel] of [
          ["speed", "Nhãn tốc độ"],
          ["offers", "Nhãn ưu đãi"],
          ["equipment", "Nhãn thiết bị"],
          ["register", "Nút đăng ký"],
          ["details", "Nút chi tiết"],
        ])
          field(details, path + ".card_labels." + key, fieldLabel);
        const prices = node("div", "", "lp-admin-price-grid");
        details.append(node("h3", "Giá riêng mỗi tháng"), prices);
        for (const period of [1, 6, 12]) {
          const wrap = node(
              "label",
              period === 1 ? "Hàng tháng" : period + " tháng",
              "lp-admin-field",
            ),
            pInput = node("input");
          pInput.type = "text";
          pInput.inputMode = "numeric";
          pInput.placeholder = "Dùng giá trang chủ";
          pInput.dataset.landingPrice = period;
          pInput.dataset.landingPricePlan = plan.id;
          pInput.setAttribute(
            "aria-label",
            "Giá riêng " + period + " tháng của " + plan.name,
          );
          const current = presentation.campaign_prices.find(
            (p) => p.billing_months === period,
          );
          pInput.value = current
            ? new Intl.NumberFormat("vi-VN").format(current.monthly_vnd)
            : "";
          pInput.oninput = () => {
            const clean = pInput.value.replace(/[.,\s]/g, "");
            if (clean && (!/^\d+$/.test(clean) || Number(clean) > 1000000000)) {
              pInput.setCustomValidity("Nhập giá nguyên không quá 1 tỷ đồng.");
              return;
            }
            pInput.setCustomValidity("");
            presentation.campaign_prices = presentation.campaign_prices.filter(
              (p) => p.billing_months !== period,
            );
            if (clean)
              presentation.campaign_prices.push({
                billing_months: period,
                monthly_vnd: Number(clean),
              });
            updateDirtyState(true);
            pushHistory();
            queuePreview();
          };
          pInput.onblur = () => {
            if (pInput.value && pInput.validity.valid)
              pInput.value = new Intl.NumberFormat("vi-VN").format(
                Number(pInput.value.replace(/[.,\s]/g, "")),
              );
          };
          wrap.append(pInput);
          prices.append(wrap);
        }
        details.append(
          node(
            "p",
            "Giá mỗi tháng; tổng kỳ = giá × số tháng + phí/thiết bị/VAT. Chỉ hiệu lực sau Công bố; cần quyền thiết lập và công bố giá. Preview bản đang nhập dùng bảng giá hiện hành.",
            "lp-admin-field-help",
          ),
        );
        details.append(
          button("Khôi phục nhãn & giá trang chủ", () => {
            presentation.card_labels = {};
            presentation.campaign_prices = [];
            presentation.badge = "";
            presentation.features = [];
            updateDirtyState(true);
            pushHistory();
            renderFields();
            queuePreview();
          }),
        );
        field(details, path + ".subtitle", "Mô tả ngắn");
        const badgeInput = field(details, path + ".badge", "Nhãn nổi bật");
        const hideBadge = document.createElement("label");
        hideBadge.className = "lp-admin-check";
        const hideBadgeInput = document.createElement("input");
        hideBadgeInput.type = "checkbox";
        hideBadgeInput.checked = presentation.card_labels.badge === "";
        hideBadgeInput.onchange = () => {
          if (hideBadgeInput.checked) {
            presentation.card_labels.badge = "";
            presentation.badge = "";
            const badgeField = details.querySelector(
              '[data-path="' + path + '.badge"]',
            );
            if (badgeField) badgeField.value = "";
          } else delete presentation.card_labels.badge;
          updateDirtyState(true);
          pushHistory();
          queuePreview();
        };
        hideBadge.append(
          hideBadgeInput,
          document.createTextNode("Ẩn nhãn nổi bật trên thẻ"),
        );
        badgeInput.addEventListener("input", () => {
          if (badgeInput.value) {
            delete presentation.card_labels.badge;
            hideBadgeInput.checked = false;
          }
        });
        details.append(hideBadge);
        field(details, path + ".accent", "Màu thẻ", "select", [
          ["blue", "Xanh"],
          ["orange", "Cam"],
        ]);
        const features = field(
          details,
          path + ".features",
          "Quyền lợi · mỗi dòng một mục (tối đa 8)",
          "textarea",
          null,
          false,
          (text) =>
            text
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
        );
        features.value = presentation.features.join("\n");
        box.append(details);
      }
      plansContainer.append(box);
    }
    check(s, "landing.show_comparison", "Hiển thị bảng so sánh");
    field(s, "landing.compare_title", "Tiêu đề bảng so sánh");

    // SECTION 3: Chiến dịch & ưu đãi
    s = section("3. Chiến dịch & ưu đãi", false, "s-campaign");
    check(s, "landing.campaign.enabled", "Bật chiến dịch có thời hạn");
    field(s, "landing.campaign.title", "Tên chiến dịch");
    field(s, "landing.campaign.gift_label", "Quà / quyền lợi nhận được");
    const dates = node("div", "", "admin-form-grid");
    s.append(dates);
    field(
      dates,
      "landing.campaign.start",
      "Bắt đầu (tùy chọn)",
      "datetime-local",
    );
    field(
      dates,
      "landing.campaign.end",
      "Kết thúc (bắt buộc khi bật)",
      "datetime-local",
    );
    field(
      s,
      "landing.campaign.conditions",
      "Điều kiện nhận ưu đãi: gói, kỳ hạn, địa bàn, phí và cách nhận quà",
      "textarea",
    );
    const stock = node("div", "", "admin-form-grid");
    s.append(stock);
    for (const [key, label] of [
      ["stock_total", "Tổng số suất"],
      ["stock_remaining", "Số suất còn lại"],
    ]) {
      const input = field(
        stock,
        "landing.campaign." + key,
        label,
        "number",
        undefined,
        false,
        (v) => (v === "" ? null : Number(v)),
      );
      input.min = key === "stock_total" ? 1 : 0;
      input.max = 1000000;
      input.step = 1;
    }
    s.append(
      node(
        "p",
        "Để trống số lượng nếu không giới hạn. Số suất do bạn cập nhật sau khi chốt đơn; gửi form chưa giữ quà. Hết hạn/hết suất sẽ dùng giá thường. Countdown không tự đặt lại.",
        "lp-admin-field-help",
      ),
    );
    check(s, "landing.campaign.show_countdown", "Hiển thị đếm ngược");
    check(
      s,
      "landing.campaign.show_activity",
      "Hiển thị số phiên quan tâm đo được trong 5 phút (chỉ phiên đồng ý phân tích)",
    );
    check(
      s,
      "landing.campaign.inherit_promotions",
      "Cộng ưu đãi chung vào giá riêng (mặc định không cộng)",
    );
    check(s, "landing.show_promo", "Hiển thị ưu đãi");
    field(s, "landing.promo_title", "Tiêu đề ưu đãi");
    field(s, "landing.promo_subtitle", "Điều kiện / mô tả ưu đãi");
    photo(s, "landing.promo_image_id", "Ảnh trang trí ưu đãi");
    repeat(
      s,
      "landing.promo_items",
      "Quyền lợi ưu đãi",
      [
        ["title", "Tên ưu đãi"],
        ["text", "Điều kiện"],
        ["icon", "Biểu tượng", "select", icons],
      ],
      { title: "Ưu đãi", text: "", icon: "award" },
      4,
    );

    // SECTION 4: Lợi ích & số liệu
    s = section("4. Lợi ích & số liệu", false, "s-benefits");
    check(s, "landing.show_benefits", "Hiển thị lợi ích");
    field(s, "landing.benefits_title", "Tiêu đề lợi ích");
    repeat(
      s,
      "landing.benefits",
      "Lợi ích",
      [
        ["title", "Tiêu đề"],
        ["text", "Mô tả"],
        ["icon", "Biểu tượng", "select", icons],
      ],
      { title: "Lợi ích", text: "", icon: "wifi" },
      8,
    );
    check(s, "landing.show_stats", "Hiển thị số liệu đã nhập");
    field(s, "landing.stats_title", "Tiêu đề số liệu");
    repeat(
      s,
      "landing.stats",
      "Số liệu",
      [
        ["value", "Giá trị"],
        ["label", "Nhãn"],
        ["icon", "Biểu tượng", "select", icons],
      ],
      { value: "", label: "", icon: "users" },
      6,
    );

    // SECTION 5: Đánh giá khách hàng & câu hỏi
    s = section("5. Đánh giá khách hàng & câu hỏi", false, "s-reviews");
    check(s, "landing.show_reviews", "Hiển thị đánh giá đã nhập");
    field(s, "landing.reviews_title", "Tiêu đề đánh giá");
    repeat(
      s,
      "landing.reviews",
      "Đánh giá",
      [
        ["name", "Tên khách hàng"],
        ["location", "Khu vực"],
        ["quote", "Nội dung", "textarea"],
        ["rating", "Điểm sao (1–5)", "number"],
      ],
      { name: "", location: "", quote: "", rating: 5, avatar_image_id: null },
      12,
    );
    check(s, "landing.show_faq", "Hiển thị FAQ");
    field(s, "landing.faq_title", "Tiêu đề FAQ");
    repeat(
      s,
      "landing.faqs",
      "Câu hỏi",
      [
        ["question", "Câu hỏi"],
        ["answer", "Trả lời", "textarea"],
      ],
      { question: "", answer: "" },
      16,
    );

    // SECTION 6: Liên hệ, menu & footer
    s = section("6. Liên hệ, menu & footer", false, "s-contact");
    field(
      s,
      "landing.contact_phone",
      "Hotline riêng (trống = dùng hotline chung)",
    );
    field(
      s,
      "landing.zalo_url",
      "Link Zalo (trống = theo hotline) · https://zalo.me/0868247625",
    );
    field(
      s,
      "landing.messenger_url",
      "Link Messenger · ví dụ https://m.me/ten-trang",
    );
    field(s, "landing.contact_label", "Nhãn nút liên hệ nổi");
    field(s, "landing.contact_icon", "Biểu tượng liên hệ", "select", [
      ["support", "Tai nghe tư vấn"],
      ["phone", "Điện thoại"],
      ["message", "Tin nhắn"],
    ]);
    check(s, "landing.show_contact_popup", "Hiển thị nút và popup liên hệ");
    repeat(
      s,
      "landing.nav_items",
      "Menu",
      [
        ["label", "Tên menu"],
        ["href", "Liên kết"],
      ],
      { label: "", href: "/#lp-plans" },
      8,
    );
    check(s, "landing.show_closing", "Hiển thị form cuối trang");
    field(s, "landing.closing_title", "Tiêu đề đăng ký cuối trang");
    field(s, "landing.closing_subtitle", "Mô tả cuối trang");
    photo(s, "landing.closing_image_id", "Ảnh cuối trang");
    photo(s, "landing.logo_image_id", "Logo (mặc định FPT Telecom)");
    field(s, "landing.footer_text", "Nội dung footer", "textarea");
    repeat(
      s,
      "landing.footer_links",
      "Liên kết footer",
      [
        ["label", "Tên liên kết"],
        ["href", "URL"],
      ],
      { label: "", href: "/chinh-sach-bao-mat" },
      12,
    );
    s.append(node("h3", "Danh mục footer"));
    const groups = node("div");
    s.append(groups);
    const renderGroups = () => {
      groups.replaceChildren();
      draft.landing.footer_groups.forEach((group, i) => {
        const card = node("div", "", "lp-admin-repeat-row");
        field(card, "landing.footer_groups." + i + ".title", "Tên danh mục");
        repeat(
          card,
          "landing.footer_groups." + i + ".links",
          "Liên kết",
          [
            ["label", "Tên liên kết"],
            ["href", "URL"],
          ],
          { label: "", href: "/" },
          12,
        );
        card.append(
          button("Xóa danh mục", () => {
            draft.landing.footer_groups.splice(i, 1);
            updateDirtyState(true);
            pushHistory();
            renderGroups();
            queuePreview();
          }),
        );
        card.append(
          button("Lên trên", () => {
            if (i) {
              const all = draft.landing.footer_groups;
              [all[i - 1], all[i]] = [all[i], all[i - 1]];
              updateDirtyState(true);
              pushHistory();
              renderGroups();
              queuePreview();
            }
          }),
        );
        groups.append(card);
      });
    };
    renderGroups();
    s.append(
      button("+ Thêm danh mục footer", () => {
        if (draft.landing.footer_groups.length >= 6)
          return showError("Tối đa 6 danh mục.");
        draft.landing.footer_groups.push({ title: "Danh mục mới", links: [] });
        updateDirtyState(true);
        pushHistory();
        renderGroups();
        queuePreview();
      }),
    );
    s.append(
      node(
        "p",
        "Chưa thêm danh mục: tự dùng Dịch vụ và Hỗ trợ. Thêm danh mục riêng sẽ thay danh mục mặc định.",
        "lp-admin-field-help",
      ),
    );

    updateSidebarNav();
  }

  function payload(preview = false) {
    const data = clone(draft);
    if (preview) {
      data.title = data.title || "Xem trước landing";
      data.slug = data.slug || "preview-landing";
    }
    data.blocks = [];
    data.canonical_path = null;
    data.template = "telecom";
    const clean = (v) => {
      if (Array.isArray(v)) v.forEach(clean);
      else if (v && typeof v === "object")
        for (const key of Object.keys(v)) {
          if (key.endsWith("_image_url")) delete v[key];
          else clean(v[key]);
        }
    };
    clean(data.landing);
    for (const p of data.landing.plan_presentations) {
      p.card_labels ||= {};
      for (const k of Object.keys(p.card_labels))
        if (k !== "badge" && !p.card_labels[k]) delete p.card_labels[k];
    }
    data.landing.plan_presentations = data.landing.plan_presentations.filter(
      (p) =>
        p.subtitle ||
        p.badge ||
        p.features.length ||
        p.accent !== "blue" ||
        Object.keys(p.card_labels).length ||
        p.campaign_prices?.length,
    );
    return data;
  }

  function scalePreview() {
    const frame = $("lp-admin-preview-frame");
    if (!frame) return;
    const canvas = frame.parentElement,
      w = Number($("lp-admin-viewport").value),
      scale = Math.min(1, canvas.clientWidth / w);
    frame.style.width = w + "px";
    frame.style.height = canvas.clientHeight / scale + "px";
    frame.style.transform = "scale(" + scale + ")";
    frame.style.left = Math.max(0, (canvas.clientWidth - w * scale) / 2) + "px";
  }

  async function preview() {
    if (!draft || pendingUploads()) return;
    previewController?.abort();
    const controller = new AbortController();
    previewController = controller;
    const seq = ++previewSeq;
    $("lp-admin-preview-state").textContent = "Đang cập nhật bản đang nhập…";
    try {
      const r = await adminFetch("/api/v1/admin/landing-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(true)),
        signal: controller.signal,
      });
      if (!r.ok)
        throw Error(
          "Nội dung chưa hợp lệ. Preview đang giữ bản hợp lệ gần nhất.",
        );
      const html = await r.text();
      if (seq !== previewSeq) return;
      $("lp-admin-preview-frame").srcdoc = html;
      $("lp-admin-preview-state").textContent = "Bản đang nhập · Chưa công bố";
      scalePreview();
    } catch (e) {
      if (seq === previewSeq && e.name !== "AbortError")
        $("lp-admin-preview-state").textContent = e.message;
    }
  }

  function queuePreview() {
    previewSeq++;
    previewController?.abort();
    clearTimeout(timer);
    timer = setTimeout(preview, 400);
  }

  async function open(item = null, isClone = false) {
    if (dirty && !confirm("Bỏ bản đang nhập để mở trang khác?")) return;
    sequence++;
    const seq = sequence;
    previewSeq++;
    previewController?.abort();
    clearTimeout(timer);
    row = isClone ? null : item;
    historyStack = [];
    historyIdx = -1;

    draft = {
      title: item?.payload.title || "Landing Internet FPT",
      slug: item?.payload.slug || "",
      description: item?.payload.description || "",
      template: "telecom",
      blocks: [],
      landing: {
        ...clone(defaults),
        ...clone(item?.payload.landing || {}),
        campaign: {
          ...clone(defaults.campaign),
          ...clone(item?.payload.landing?.campaign || {}),
        },
      },
    };

    updateDirtyState(isClone);
    pushHistory();
    $("lp-admin-editor").hidden = false;
    $("lp-admin-save").disabled = true;
    $("lp-admin-fields").replaceChildren();
    $("lp-admin-error").textContent = "";
    $("lp-admin-save-state").textContent = "";
    $("lp-admin-preview-frame").srcdoc = "<p>Đang chuẩn bị bản xem trước…</p>";
    $("lp-admin-editor-title").textContent = isClone
      ? "Nhân bản trang: " + item.payload.title
      : item
        ? "Chỉnh sửa: " + item.payload.title
        : "Tạo landing page theo mẫu";
    $("lp-admin-draft-label").textContent = isClone
      ? "Bản sao mới · Chưa lưu"
      : item
        ? "Phiên bản " + item.version + " · " + item.status
        : "Bản nháp mới";

    try {
      const loadedPlans = (await request("/catalog")).items;
      if (seq !== sequence) return;
      plans = loadedPlans;
      renderFields();
      $("lp-admin-save").disabled = pendingUploads() > 0;
      preview();
      $("lp-admin-editor").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (e) {
      if (seq === sequence) showError(e.message);
    }
  }

  /* Duplicate / Clone Page Handler */
  function clonePage(item) {
    const cloned = clone(item.payload);
    cloned.title = (cloned.title || "Landing") + " (Bản sao)";
    const randSuffix = Math.floor(1000 + Math.random() * 9000);
    cloned.slug =
      (cloned.slug || "landing").replace(/-ban-sao-\d+$/, "") +
      "-ban-sao-" +
      randSuffix;
    open({ payload: cloned, version: 1, status: "draft", id: null }, true);
  }

  async function load() {
    try {
      pages = (await request("/admin/pages?limit=100")).items;
      const telecomPages = pages.filter(
        (p) => p.payload.template === "telecom",
      );
      const badge = $("lp-admin-count-badge");
      if (badge) badge.textContent = telecomPages.length + " trang";

      const renderList = (filter = "all", query = "") => {
        $("lp-admin-list").replaceChildren();
        const filtered = telecomPages.filter((item) => {
          const matchStatus =
            filter === "all" ||
            (filter === "published" && item.status === "published") ||
            (filter === "draft" && item.status === "draft") ||
            (filter === "retired" && item.status === "retired");
          const q = query.toLowerCase();
          const matchQuery =
            !q ||
            item.payload.title.toLowerCase().includes(q) ||
            item.payload.slug.toLowerCase().includes(q);
          return matchStatus && matchQuery;
        });

        filtered.forEach((item) => {
          const card = node("article", "", "lp-admin-page");
          const top = node("div", "", "lp-admin-page-top");
          const statusClass =
            item.status === "published"
              ? "status-published"
              : item.status === "retired"
                ? "status-retired"
                : "status-draft";
          const statusLabel =
            item.status === "published"
              ? "Đã công bố"
              : item.status === "retired"
                ? "Đã ngừng"
                : "Bản nháp";
          top.append(
            node("span", statusLabel, "lp-admin-status " + statusClass),
            node("span", "v" + item.version, "lp-admin-version"),
          );

          const planCount = item.payload.landing?.plan_ids?.length || 0;
          const meta = node("div", "", "lp-admin-page-meta");
          meta.append(node("span", planCount + " gói"));
          if (item.payload.landing?.campaign?.enabled) {
            meta.append(node("span", "⚡ Có ưu đãi"));
          }

          card.append(
            top,
            node("h3", item.payload.title),
            node("small", "/" + item.payload.slug),
            meta,
          );

          const actions = node("div", "", "workspace-item-actions");
          if (item.status !== "retired")
            actions.append(button("Chỉnh sửa", () => open(item)));

          const link = node("a", "Xem trước", "pricing-btn");
          link.href = "/admin/pages/" + item.id + "/preview";
          link.target = "_blank";
          link.rel = "noopener";
          actions.append(link);

          // Clone / Duplicate Button: One click to replicate for new campaigns
          actions.append(
            button(
              "Nhân bản",
              () => clonePage(item),
              "pricing-btn btn-action-clone",
            ),
          );

          if (
            adminHasPermission("content.publish") &&
            item.status !== "retired"
          )
            actions.append(
              button("Công bố", async () => {
                try {
                  await request(
                    "/admin/pages/" + item.id + "/publish",
                    "POST",
                    {
                      expected_version: item.version,
                    },
                  );
                  await load();
                } catch (e) {
                  $("lp-admin-list-status").textContent = e.message;
                }
              }),
            );

          if (item.status === "published") {
            const live = node("a", "Mở trang", "pricing-btn");
            live.href = "/" + item.payload.slug;
            live.target = "_blank";
            live.rel = "noopener";
            actions.append(live);
          }

          if (item.status !== "retired")
            actions.append(
              button("Xóa / ngừng", async () => {
                if (
                  !confirm(
                    "Ngừng trang này? URL công khai sẽ không còn hoạt động.",
                  )
                )
                  return;
                try {
                  await request("/admin/pages/" + item.id + "/retire", "POST", {
                    expected_version: item.version,
                  });
                  await load();
                } catch (e) {
                  $("lp-admin-list-status").textContent = e.message;
                }
              }),
            );

          card.append(actions);
          $("lp-admin-list").append(card);
        });
      };

      renderList(
        document.querySelector(".lp-filter-chip.active")?.dataset.filter ||
          "all",
        $("lp-admin-list-search")?.value || "",
      );

      const searchInput = $("lp-admin-list-search");
      if (searchInput) {
        searchInput.oninput = () =>
          renderList(
            document.querySelector(".lp-filter-chip.active")?.dataset.filter ||
              "all",
            searchInput.value,
          );
      }

      document.querySelectorAll(".lp-filter-chip").forEach((btn) => {
        btn.onclick = () => {
          document
            .querySelectorAll(".lp-filter-chip")
            .forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          renderList(btn.dataset.filter, searchInput?.value || "");
        };
      });

      $("lp-admin-list-status").textContent = telecomPages.length
        ? "Lưu nháp trước khi công bố. Bấm 'Nhân bản' để tạo trang mới tương tự phục vụ chạy nhiều quảng cáo đồng thời."
        : "Chưa có landing theo mẫu. Bấm Tạo landing page để bắt đầu.";
    } catch (e) {
      $("lp-admin-list-status").textContent = e.message;
    }
  }

  // Event Listeners & Setup
  window.addEventListener("DOMContentLoaded", () => {
    $("lp-admin-new").onclick = () => open();
    $("lp-admin-refresh").onclick = load;
    $("lp-admin-close").onclick = () => {
      if (dirty && !confirm("Đóng mà không lưu thay đổi?")) return;
      $("lp-admin-editor").hidden = true;
      updateDirtyState(false);
    };

    $("lp-admin-viewport").onchange = () => {
      document.querySelectorAll(".lp-device-pill").forEach((pill) => {
        pill.classList.toggle(
          "active",
          pill.dataset.width === $("lp-admin-viewport").value,
        );
      });
      scalePreview();
    };

    document.querySelectorAll(".lp-device-pill").forEach((pill) => {
      pill.onclick = () => {
        $("lp-admin-viewport").value = pill.dataset.width;
        document
          .querySelectorAll(".lp-device-pill")
          .forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        scalePreview();
      };
    });

    $("lp-admin-preview-refresh").onclick = preview;
    const copyBtn = $("lp-admin-preview-copy-link");
    if (copyBtn) {
      copyBtn.onclick = () => {
        if (!row?.id)
          return showError(
            "Lưu bản nháp trước khi sao chép liên kết xem trước.",
          );
        const fullUrl =
          window.location.origin + "/admin/pages/" + row.id + "/preview";
        navigator.clipboard
          .writeText(fullUrl)
          .then(() => {
            if (window.showToast)
              window.showToast(
                "Đã sao chép preview bản đã lưu; người mở cần đăng nhập Admin.",
                "success",
              );
            else alert("Đã sao chép: " + fullUrl);
          })
          .catch(() => {
            alert("Link xem trước: " + fullUrl);
          });
      };
    }
    const updateCanvasViewport = () => {
      const canvas = document.querySelector(".lp-admin-preview-canvas");
      if (canvas && $("lp-admin-viewport")) {
        canvas.dataset.viewport = $("lp-admin-viewport").value;
      }
    };
    $("lp-admin-viewport").addEventListener("change", updateCanvasViewport);
    document
      .querySelectorAll(".lp-device-pill")
      .forEach((p) => p.addEventListener("click", updateCanvasViewport));
    updateCanvasViewport();

    window.addEventListener("resize", scalePreview);

    // 1-Click Preset Apply
    const presetApplyBtn = $("lp-admin-preset-apply");
    if (presetApplyBtn) {
      presetApplyBtn.onclick = () => {
        if (!draft) return;
        if (pendingUploads())
          return showError("Đợi ảnh tải xong trước khi áp dụng mẫu.");
        const val = $("lp-admin-preset-select").value;
        if (!val || !PRESETS[val]) {
          return showError("Vui lòng chọn một preset trong danh sách.");
        }
        if (
          !confirm(
            "Áp dụng preset '" +
              PRESETS[val].name +
              "'? Tiêu đề, màu sắc và nội dung sẽ thay đổi. Giá, thời gian và số suất ưu đãi đang thiết lập được giữ nguyên.",
          )
        )
          return;
        PRESETS[val].apply(draft);
        updateDirtyState(true);
        pushHistory();
        renderFields();
        queuePreview();
      };
    }

    // Undo / Redo
    const undoBtn = $("lp-admin-undo"),
      redoBtn = $("lp-admin-redo");
    if (undoBtn) undoBtn.onclick = undo;
    if (redoBtn) redoBtn.onclick = redo;

    window.addEventListener("keydown", (e) => {
      if (!draft || $("lp-admin-editor").hidden || e.defaultPrevented) return;
      if (e.target.closest?.("input,textarea,[contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        redo();
      }
    });

    // Mobile / Tablet Tab Switcher
    const tabEdit = $("lp-tab-edit"),
      tabPreview = $("lp-tab-preview"),
      workspace = document.querySelector(".lp-admin-workspace");
    if (tabEdit && tabPreview && workspace) {
      tabEdit.onclick = () => {
        tabEdit.classList.add("active");
        tabPreview.classList.remove("active");
        tabEdit.setAttribute("aria-selected", "true");
        tabPreview.setAttribute("aria-selected", "false");
        workspace.dataset.activeView = "edit";
      };
      tabPreview.onclick = () => {
        tabPreview.classList.add("active");
        tabEdit.classList.remove("active");
        tabEdit.setAttribute("aria-selected", "false");
        tabPreview.setAttribute("aria-selected", "true");
        workspace.dataset.activeView = "preview";
        setTimeout(scalePreview, 50);
      };
    }

    // Form Submit (Save draft)
    $("lp-admin-form").onsubmit = async (e) => {
      e.preventDefault();
      if (pendingUploads()) return showError("Đợi ảnh tải xong trước khi lưu.");
      const seq = sequence;
      if (saves.has(seq)) return;
      const target = row;
      const data = payload();
      const submitted = JSON.stringify(data);
      saves.add(seq);
      $("lp-admin-save").disabled = true;
      $("lp-admin-error").textContent = "";
      $("lp-admin-save-state").textContent = "Đang lưu bản nháp…";
      try {
        const res = target
          ? await request(
              "/admin/pages/" +
                target.id +
                "?expected_version=" +
                target.version,
              "PUT",
              data,
            )
          : await request("/admin/pages", "POST", data);
        if (seq !== sequence) return;
        row = res;
        const changed = submitted !== JSON.stringify(payload());
        updateDirtyState(changed);
        $("lp-admin-draft-label").textContent =
          "Phiên bản " + res.version + " · " + res.status;
        $("lp-admin-save-state").textContent =
          "Đã lưu bản nháp lúc " +
          new Date().toLocaleTimeString("vi-VN") +
          (changed ? " · Các thay đổi mới chưa lưu" : "");
        await load();
      } catch (err) {
        if (seq !== sequence) return;
        showError(err.message);
        $("lp-admin-save-state").textContent = "";
      } finally {
        saves.delete(seq);
        if (seq === sequence)
          $("lp-admin-save").disabled = pendingUploads() > 0;
      }
    };

    window.addEventListener("beforeunload", (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    load().then(async () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (!id) return;
      try {
        const item =
          pages.find((p) => p.id === id) ||
          (await request("/admin/pages/" + encodeURIComponent(id)));
        if (item.payload.template === "telecom") return open(item);
        $("lp-admin-list-status").textContent =
          "Trang này dùng trình soạn thảo nội dung.";
      } catch (_) {
        $("lp-admin-list-status").textContent =
          "Không tìm thấy trang hoặc tài khoản chưa có quyền xem.";
      }
    });
  });
})();
