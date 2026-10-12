/* Scoped package/media lookups and CAS save share the display settings version. */
(() => {
  const form = document.getElementById("home-merchandising-form");
  if (!form) return;
  const $ = (id) => document.getElementById(id),
    state = $("home-merchandising-state");
  const types = {
    internet: "Internet gia đình",
    business: "Doanh nghiệp",
    combo: "Combo",
    play: "Truyền hình",
    camera: "Camera",
  };
  let plans = [],
    media = [],
    slides = [],
    loading = true,
    pendingUploads = 0,
    previewIndex = 0;
  function field(parent, key, title, type, value, required = false) {
    const label = adminNode("label", title),
      input = document.createElement(
        type === "textarea" ? "textarea" : "input",
      );
    if (type !== "textarea") input.type = type;
    input.dataset.key = key;
    input.value = value ?? "";
    input.required = required;
    if (type === "checkbox") {
      input.checked = !!value;
      label.className = "admin-check";
    }
    label.append(input);
    parent.append(label);
    return input;
  }
  function checked(parent, key, title, values, selected) {
    const group = document.createElement("fieldset");
    group.append(adminNode("legend", title));
    const list = adminNode("div", "", "admin-form-grid");
    group.append(list);
    for (const [id, name] of values) {
      const input = field(list, key, name, "checkbox", selected.includes(id));
      input.value = id;
    }
    parent.append(group);
  }
  function select(parent, key, title, options, value) {
    const label = adminNode("label", title),
      input = document.createElement("select");
    input.dataset.key = key;
    for (const [id, name] of [["", "Không chọn"], ...options]) {
      const option = adminNode("option", name);
      option.value = id;
      input.append(option);
    }
    input.value = value || "";
    label.append(input);
    parent.append(label);
    return input;
  }
  const value = (row, key) =>
    row.querySelector('[data-key="' + key + '"]').value;
  const selected = (row, key) =>
    [...row.querySelectorAll('[data-key="' + key + '"]:checked')].map(
      (e) => e.value,
    );
  const localTime = (s) =>
    s
      ? new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Ho_Chi_Minh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
          .format(new Date(s))
          .replace(" ", "T")
      : "";
  const utc = (s) => (s ? new Date(s + ":00+07:00").toISOString() : null);
  function readSlides() {
    return [...$("home-slide-editor").children].map((row) => ({
      title: value(row, "title"),
      description: value(row, "description"),
      image_id: value(row, "image_id") || null,
      image_alt: value(row, "image_alt"),
      cta_label: row.dataset.ctaLabel || "Nhận tư vấn",
      href: value(row, "href"),
      video_url: value(row, "video_url"),
      plan_id: value(row, "plan_id") || null,
      enabled: row.querySelector("[data-key=enabled]").checked,
      start: utc(value(row, "start")),
      end: utc(value(row, "end")),
    }));
  }
  function renderSlides() {
    $("home-slide-editor").replaceChildren();
    slides.forEach((slide, index) => {
      const row = adminNode("details", "", "workspace-item slide-editor-row");
      row.open = index === previewIndex;
      row.dataset.ctaLabel = slide.cta_label || "Nhận tư vấn";
      const summary = adminNode(
        "summary",
        "Slide " + (index + 1) + " · " + (slide.title || "Chưa đặt tiêu đề"),
      );
      row.append(summary);
      row.addEventListener("toggle", () => {
        if (row.open) {
          previewIndex = index;
          preview();
        }
      });
      const grid = adminNode("div", "", "admin-form-grid");
      row.append(grid);
      field(
        grid,
        "title",
        "Tên nội bộ (không hiện trên slide)",
        "text",
        slide.title,
        true,
      ).maxLength = 80;
      field(
        grid,
        "description",
        "Ghi chú nội bộ",
        "textarea",
        slide.description,
      ).maxLength = 160;
      const image = select(
        grid,
        "image_id",
        "Ảnh ưu đãi",
        media.map((m) => [
          m.id,
          m.payload.original_name ||
            m.payload.filename ||
            "Ảnh " + m.id.slice(0, 8),
        ]),
        slide.image_id,
      );
      const imagePreview = document.createElement("img");
      imagePreview.alt = "Xem trước ảnh slide";
      imagePreview.width = 240;
      imagePreview.style.cssText =
        "max-width:100%;height:auto;border-radius:12px";
      imagePreview.className = "slide-preview-image";
      row.append(imagePreview);
      const refresh = () => {
        const asset = media.find((m) => m.id === image.value);
        const url =
          asset?.payload.url ||
          asset?.payload.image_url ||
          (slide.image_id === image.value ? slide.image_url : null);
        imagePreview.hidden = !url;
        if (url) imagePreview.src = url;
        else imagePreview.removeAttribute("src");
      };
      image.addEventListener("change", refresh);
      const uploadLabel = adminNode(
          "label",
          "Tải ảnh trực tiếp",
          "pricing-btn slide-upload-label",
        ),
        upload = document.createElement("input");
      upload.type = "file";
      upload.accept = "image/jpeg,image/png,image/webp";
      upload.disabled = !adminHasPermission("content.write");
      uploadLabel.append(upload);
      row.append(uploadLabel);
      const uploadState = adminNode(
        "p",
        "JPEG, PNG hoặc WebP ≤10 MB.",
        "pricing-hint",
      );
      uploadState.setAttribute("role", "status");
      row.append(uploadState);
      upload.onchange = async () => {
        const file = upload.files[0];
        if (!file) return;
        pendingUploads++;
        $("home-save-merchandising").disabled = true;
        upload.disabled = true;
        uploadState.textContent = "Đang tải & xử lý ảnh…";
        try {
          const asset = await adminUploadImage(file);
          media.push(asset);
          if (!row.isConnected) return;
          for (const input of $("home-slide-editor").querySelectorAll(
            '[data-key="image_id"]',
          )) {
            const option = adminNode("option", file.name);
            option.value = asset.id;
            input.append(option);
          }
          image.value = asset.id;
          refresh();
          previewIndex = index;
          preview();
          uploadState.textContent = "Ảnh sẵn sàng. Bấm Lưu để áp dụng.";
        } catch (err) {
          if (row.isConnected) uploadState.textContent = err.message;
        } finally {
          pendingUploads--;
          $("home-save-merchandising").disabled = pendingUploads > 0;
          upload.disabled = false;
          upload.value = "";
        }
      };
      refresh();
      field(grid, "image_alt", "Mô tả ảnh", "text", slide.image_alt).maxLength =
        120;
      const link = field(
        grid,
        "href",
        "Liên kết khi bấm slide",
        "text",
        slide.href,
      );
      link.maxLength = 300;
      link.placeholder = "/khuyen-mai hoặc https://…";
      const video = field(
        grid,
        "video_url",
        "Video MP4 / WebM (tùy chọn)",
        "url",
        slide.video_url,
      );
      video.maxLength = 300;
      video.placeholder = "https://…/uu-dai.mp4";
      row.append(
        adminNode(
          "p",
          "Có video: ảnh là ảnh chờ. Để trống liên kết: mở tư vấn gói đã chọn hoặc bảng giá. Slide chỉ hiện ảnh/video.",
          "pricing-hint",
        ),
      );
      select(
        grid,
        "plan_id",
        "Gói tư vấn (tùy chọn)",
        plans.map((p) => [p.id, p.payload.name]),
        slide.plan_id,
      );
      field(
        grid,
        "start",
        "Bắt đầu (giờ Việt Nam)",
        "datetime-local",
        localTime(slide.start),
      );
      field(
        grid,
        "end",
        "Kết thúc (giờ Việt Nam)",
        "datetime-local",
        localTime(slide.end),
      );
      field(
        grid,
        "enabled",
        "Hiển thị slide",
        "checkbox",
        slide.enabled ?? true,
      );
      const actions = adminNode("div", "", "workspace-item-actions");
      for (const [text, delta] of [
        ["Lên", -1],
        ["Xuống", 1],
        ["Xóa", 0],
      ]) {
        const b = adminNode("button", text, "btn-action-detail");
        b.type = "button";
        b.disabled =
          delta !== 0 && (index + delta < 0 || index + delta >= slides.length);
        b.addEventListener("click", () => {
          slides = readSlides();
          if (delta)
            [slides[index], slides[index + delta]] = [
              slides[index + delta],
              slides[index],
            ];
          else slides.splice(index, 1);
          previewIndex = Math.min(index, slides.length - 1);
          renderSlides();
        });
        actions.append(b);
      }
      row.append(actions);
      $("home-slide-editor").append(row);
    });
    $("home-add-slide").disabled = slides.length >= 12;
    preview();
  }
  async function list(path) {
    let next = null,
      rows = [];
    const seen = new Set();
    do {
      const data = await crmRequest(
        path + (next ? "&before=" + encodeURIComponent(next) : ""),
      );
      rows.push(...data.items);
      next = data.next_cursor || data.next_before || null;
      if (next && seen.has(next))
        throw Error("Phân trang bị lặp. Tải lại trang.");
      if (next) seen.add(next);
    } while (next);
    return rows;
  }
  async function load() {
    try {
      const result = await Promise.all([
        adminFetch("/api/v1/system/display-settings").then(async (r) => {
          if (!r.ok) throw Error("Không tải được cấu hình");
          return r.json();
        }),
        list("/plans?limit=100"),
        list("/workspace/media?limit=100"),
      ]);
      const [settings, p, m] = result;
      adminDisplayVersion = settings.version;
      plans = p.filter((x) => x.status !== "retired");
      media = m.filter(
        (x) => x.status !== "retired" && x.payload.state === "ready",
      );
      slides = settings.promo_slides;
      const experiments = $("home-hero-experiment");
      if (adminHasPermission("marketing.write")) {
        for (const row of (await list("/experiments?limit=100")).filter(
          (x) => x.status === "published",
        )) {
          const o = adminNode("option", row.payload.name);
          o.value = row.id;
          experiments.append(o);
        }
      }
      if (
        settings.hero_experiment_id &&
        !Array.from(experiments.options).some(
          (o) => o.value === settings.hero_experiment_id,
        )
      ) {
        const option = adminNode("option", "Thử nghiệm đang áp dụng");
        option.value = settings.hero_experiment_id;
        experiments.append(option);
      }
      experiments.disabled = !adminHasPermission("marketing.write");
      experiments.value = settings.hero_experiment_id || "";
      $("home-category-editor").replaceChildren();
      settings.plan_categories.forEach((c, index) => {
        const row = adminNode(
          "details",
          "",
          "workspace-item category-editor-row",
        );
        row.append(
          adminNode("summary", "Danh mục " + (index + 1) + " · " + c.name),
        );
        const grid = adminNode("div", "", "admin-form-grid");
        row.append(grid);
        field(grid, "name", "Tên danh mục", "text", c.name, true).maxLength =
          40;
        field(
          grid,
          "short_name",
          "Tên trên thanh menu",
          "text",
          c.short_name,
          true,
        ).maxLength = 12;
        field(
          grid,
          "all_plans",
          "Hiển thị mọi gói đã công bố",
          "checkbox",
          c.all_plans,
        );
        checked(
          row,
          "services",
          "Tự lấy gói theo dịch vụ",
          Object.entries(types),
          c.services,
        );
        checked(
          row,
          "plan_ids",
          "Hoặc chọn gói cụ thể",
          plans.map((p) => [
            p.id,
            p.payload.name + (p.status === "draft" ? " · Nháp" : ""),
          ]),
          c.plan_ids,
        );
        $("home-category-editor").append(row);
      });
      renderSlides();
      state.textContent =
        "Đã tải. Thứ tự danh mục và slide theo vị trí bên trên.";
      loading = false;
      $("home-save-merchandising").disabled = false;
    } catch (e) {
      state.textContent = e.message;
    }
  }
  $("home-add-slide").addEventListener("click", () => {
    if (loading) return;
    slides = readSlides();
    slides.push({ title: "", enabled: true, cta_label: "Nhận tư vấn" });
    previewIndex = slides.length - 1;
    renderSlides();
    $("home-slide-editor").lastElementChild.querySelector("input").focus();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (pendingUploads) {
      state.textContent = "Chờ ảnh xử lý xong trước khi lưu.";
      return;
    }
    const button = $("home-save-merchandising");
    button.disabled = true;
    try {
      const categories = [...$("home-category-editor").children].map((row) => ({
        name: value(row, "name"),
        short_name: value(row, "short_name"),
        all_plans: row.querySelector("[data-key=all_plans]").checked,
        plan_ids: selected(row, "plan_ids"),
        services: selected(row, "services"),
      }));
      const r = await adminFetch("/api/v1/system/display-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expected_version: adminDisplayVersion,
          promo_slides: readSlides(),
          hero_experiment_id: $("home-hero-experiment").value || null,
          plan_categories: categories,
        }),
      });
      const data = await r.json();
      if (!r.ok)
        throw Error(
          data.code === "VERSION_CONFLICT"
            ? "Cấu hình vừa thay đổi. Tải lại trang trước khi lưu."
            : data.message ||
                "Kiểm tra tên danh mục, thời gian và ảnh đã chọn.",
        );
      adminDisplayVersion = data.settings.version;
      state.textContent =
        "Đã lưu. Ưu đãi và danh mục đã cập nhật trên trang chủ.";
      showToast("Đã lưu trang chủ.", "success");
    } catch (err) {
      state.textContent = err.message;
      showToast(err.message, "error");
    } finally {
      button.disabled = false;
    }
  });
  function preview() {
    const box = $("appearance-slide-preview"),
      cats = $("appearance-category-preview");
    if (!box || !cats) return;
    const rows = [...$("home-slide-editor").children],
      row = rows[previewIndex] || rows[0];
    box.replaceChildren();
    if (row) {
      const asset = media.find((m) => m.id === value(row, "image_id"));
      const url =
        asset?.payload.url ||
        asset?.payload.image_url ||
        row.querySelector(".slide-preview-image")?.getAttribute("src");
      const videoUrl = value(row, "video_url");
      if (videoUrl && /^https:\/\//i.test(videoUrl)) {
        const video = document.createElement("video");
        video.src = videoUrl;
        video.controls = true;
        video.playsInline = true;
        video.preload = "none";
        if (url) video.poster = url;
        video.style.cssText = "width:100%;height:auto;display:block";
        box.append(video);
      } else if (url) {
        const image = document.createElement("img");
        image.src = url;
        image.alt = value(row, "image_alt") || "Xem trước ảnh ưu đãi";
        box.append(image);
      } else
        box.append(
          adminNode("p", "Chọn ảnh hoặc nhập URL video để xem trước."),
        );
      if (!row.querySelector("[data-key=enabled]").checked)
        box.append(adminNode("small", "Slide đang tắt"));
    } else box.append(adminNode("p", "Thêm slide để xem trước ưu đãi."));
    cats.replaceChildren(
      ...[...$("home-category-editor").children].map((row) =>
        adminNode("span", value(row, "short_name") || "Danh mục"),
      ),
    );
  }
  form.addEventListener("input", (event) => {
    const row = event.target.closest(".slide-editor-row");
    if (row) {
      previewIndex = [...row.parentElement.children].indexOf(row);
      row.querySelector("summary").textContent =
        "Slide " +
        (previewIndex + 1) +
        " · " +
        (value(row, "title") || "Chưa đặt tiêu đề");
    }
    const category = event.target.closest(".category-editor-row");
    if (category)
      category.querySelector("summary").textContent =
        "Danh mục " +
        ([...category.parentElement.children].indexOf(category) + 1) +
        " · " +
        (value(category, "name") || "Chưa đặt tên");
    preview();
  });
  form.addEventListener("change", preview);
  form.addEventListener(
    "invalid",
    (event) => {
      const row = event.target.closest("details");
      if (row) row.open = true;
    },
    true,
  );
  load();
})();
