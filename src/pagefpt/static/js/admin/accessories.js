/* Catalog versioned CRUD: final prices, publish separately, no manual UUID input. */
(() => {
  const $ = (id) => document.getElementById(id),
    state = $("accessory-state"),
    dialog = $("accessory-editor");
  if (!dialog) return;
  let rows = [],
    plans = [],
    media = [],
    editing = null,
    busy = false,
    editorGeneration = 0,
    uploading = false;
  const money = new Intl.NumberFormat("vi-VN");
  async function api(path, method = "GET", body) {
    const r = await adminFetch("/api/v1/admin/" + path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        data.message ||
          data.error ||
          "Chưa thực hiện được; kiểm tra quyền/MFA hoặc tải lại dữ liệu.",
      );
    return data;
  }
  function node(tag, text, cls) {
    const n = document.createElement(tag);
    n.textContent = text || "";
    if (cls) n.className = cls;
    return n;
  }
  function render() {
    const list = $("accessory-list");
    list.replaceChildren();
    const query = $("accessory-search").value.trim().toLocaleLowerCase("vi"),
      status = $("accessory-status").value;
    for (const row of rows.filter(
      (r) =>
        (!status || r.status === status) &&
        [r.payload.name, r.payload.code]
          .join(" ")
          .toLocaleLowerCase("vi")
          .includes(query),
    )) {
      const box = node("article", "", "pricing-list-card"),
        p = row.payload;
      list.dataset.bulkContainer = "accessories";
      window.PageFPTAdminLists?.bindRow(box, {
        id: row.id,
        version: row.version,
        kind: "products",
        status: row.status,
        group: "accessories",
      });
      box.append(
        node("h3", p.name),
        node(
          "p",
          `${p.price_vnd === null || p.price_vnd === undefined ? "Chưa thiết lập giá" : money.format(p.price_vnd) + "đ"} · ${p.billing_mode === "monthly" ? "Theo tháng" : "Một lần"} · ${{ draft: "Nháp", published: "Đã công bố", retired: "Đã ngừng" }[row.status] || row.status}`,
        ),
      );
      const edit = node("button", "Sửa", "pricing-btn");
      edit.type = "button";
      edit.onclick = () => open(row);
      box.append(edit);
      if (p.original_price_vnd != null)
        box.append(
          node(
            "p",
            `Giá gốc ${money.format(p.original_price_vnd)}đ${p.offer_label ? " · " + p.offer_label : ""}`,
          ),
        );
      if (row.status !== "retired")
        for (const [op, label] of [
          ["publish", "Công bố"],
          ["retire", "Ngừng cung cấp"],
        ]) {
          const btn = node("button", label, "pricing-btn");
          btn.type = "button";
          btn.onclick = async () => {
            if (busy) return;
            if (
              op === "retire" &&
              !(await adminConfirm(
                "Ngừng phụ kiện này? Lịch sử khách hàng được giữ nguyên.",
              ))
            )
              return;
            busy = true;
            btn.disabled = true;
            try {
              await api(`products/${row.id}/${op}`, "POST", {
                expected_version: row.version,
              });
              await load();
            } catch (e) {
              state.textContent = e.message;
            } finally {
              busy = false;
              btn.disabled = false;
            }
          };
          box.append(btn);
        }
      list.append(box);
    }
    if (!list.children.length)
      list.append(node("p", "Chưa có phụ kiện phù hợp."));
  }
  async function load() {
    state.textContent = "Đang tải…";
    try {
      rows = await all("products");
      render();
      state.textContent = `${rows.length} sản phẩm đã tải`;
    } catch (e) {
      state.textContent = e.message;
    }
  }
  function planChoices(selected = []) {
    const area = $("accessory-plans");
    area.replaceChildren();
    for (const row of plans.filter(
      (r) =>
        r.status !== "retired" &&
        r.payload.service === $("accessory-service").value,
    )) {
      const label = node("label", "", "pricing-check"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.value = row.id;
      input.checked = selected.includes(row.id);
      label.append(input, node("span", row.payload.name));
      area.append(label);
    }
  }
  function open(row = null) {
    editing = row;
    editorGeneration++;
    uploading = false;
    $("accessory-save").disabled = busy;
    const p = row?.payload || {};
    for (const [id, key, value] of [
      ["name", "name", ""],
      ["code", "code", ""],
      ["service", "service", "internet"],
      ["price", "price_vnd", ""],
      ["original-price", "original_price_vnd", ""],
      ["offer", "offer_label", ""],
      ["mode", "billing_mode", "one_time"],
      ["description", "description", ""],
      ["alt", "image_alt", ""],
    ])
      $("accessory-" + id).value = p[key] ?? value;
    $("accessory-image").value = p.image_id || "";
    planChoices(p.plan_ids || []);
    $("accessory-error").hidden = true;
    $("accessory-file").value = "";
    $("accessory-upload-state").textContent = "JPEG, PNG hoặc WebP ≤10 MB.";
    preview();
    dialog.showModal();
    $("accessory-name").focus();
  }
  function preview() {
    $("accessory-preview-name").textContent =
      $("accessory-name").value || "Tên phụ kiện";
    $("accessory-preview-price").textContent =
      `Giá gốc ${money.format(Number($("accessory-original-price").value || $("accessory-price").value))}đ · Giá ưu đãi ${money.format(Number($("accessory-price").value))}đ / ${$("accessory-mode").value === "monthly" ? "tháng" : "một lần"}`;
    $("accessory-preview-offer").textContent = $("accessory-offer").value;
    const image = media.find(
      (m) => m.id === $("accessory-image").value,
    )?.payload;
    const url =
      image?.url ||
      image?.image_url ||
      (editing?.payload.image_id === $("accessory-image").value
        ? editing.payload.image_url
        : null);
    $("accessory-preview-image").hidden = !url;
    if (url) $("accessory-preview-image").src = url;
    else $("accessory-preview-image").removeAttribute("src");
  }
  $("accessory-form").addEventListener("input", preview);
  $("accessory-image").addEventListener("change", preview);
  $("accessory-clear-image").onclick = () => {
    if (uploading) return;
    $("accessory-image").value = "";
    preview();
  };
  $("accessory-file").disabled = !adminHasPermission("content.write");
  $("accessory-file").onchange = async () => {
    const seq = editorGeneration,
      file = $("accessory-file").files[0];
    if (!file || uploading) return;
    uploading = true;
    $("accessory-save").disabled = true;
    $("accessory-upload-state").textContent = "Đang tải & xử lý ảnh…";
    try {
      const asset = await adminUploadImage(file);
      if (seq !== editorGeneration) return;
      media.push(asset);
      const option = node("option", file.name);
      option.value = asset.id;
      $("accessory-image").append(option);
      $("accessory-image").value = asset.id;
      preview();
      $("accessory-upload-state").textContent =
        "Ảnh sẵn sàng. Lưu và công bố để áp dụng.";
    } catch (e) {
      if (seq === editorGeneration)
        $("accessory-upload-state").textContent = e.message;
    } finally {
      if (seq === editorGeneration) {
        uploading = false;
        $("accessory-save").disabled = false;
        $("accessory-file").value = "";
      }
    }
  };
  async function all(path) {
    let items = [],
      before = null;
    const seen = new Set();
    do {
      const data = await api(
        path +
          "?limit=100" +
          (before ? "&before=" + encodeURIComponent(before) : ""),
      );
      items.push(...(data.items || []));
      before = data.next_cursor || data.next_before || null;
      if (before && seen.has(before))
        throw Error("Phân trang bị lặp; hãy tải lại.");
      if (before) seen.add(before);
    } while (before);
    return items;
  }
  async function lookups() {
    $("accessory-add").disabled = true;
    try {
      plans = await all("plans");
      media = await all("workspace/media");
      $("accessory-add").disabled = false;
      const select = $("accessory-image");
      for (const r of media.filter(
        (r) => r.status !== "retired" && r.payload.state === "ready",
      )) {
        const o = node(
          "option",
          r.payload.filename || r.payload.name || "Ảnh " + r.id.slice(0, 8),
        );
        o.value = r.id;
        select.append(o);
      }
    } catch (e) {
      state.textContent = e.message;
      $("accessory-add").disabled = true;
    }
  }
  $("accessory-form").onsubmit = async (e) => {
    e.preventDefault();
    if (busy || uploading) return;
    busy = true;
    $("accessory-save").disabled = true;
    try {
      if (
        $("accessory-original-price").value &&
        Number($("accessory-original-price").value) <
          Number($("accessory-price").value)
      )
        throw Error("Giá gốc phải lớn hơn hoặc bằng giá ưu đãi.");
      const body = {
        name: $("accessory-name").value.trim(),
        code: $("accessory-code").value.trim(),
        service: $("accessory-service").value,
        price_vnd: Number($("accessory-price").value),
        original_price_vnd:
          $("accessory-original-price").value === ""
            ? null
            : Number($("accessory-original-price").value),
        offer_label: $("accessory-offer").value.trim(),
        billing_mode: $("accessory-mode").value,
        description: $("accessory-description").value,
        plan_ids: [
          ...document.querySelectorAll("#accessory-plans input:checked"),
        ].map((e) => e.value),
        image_id: $("accessory-image").value || null,
        image_alt: $("accessory-alt").value,
      };
      await api(
        editing
          ? `products/${editing.id}?expected_version=${editing.version}`
          : "products",
        editing ? "PUT" : "POST",
        body,
      );
      dialog.close();
      await load();
    } catch (err) {
      $("accessory-error").hidden = false;
      $("accessory-error").textContent = err.message;
    } finally {
      busy = false;
      $("accessory-save").disabled = false;
    }
  };
  window.addEventListener("pagefpt-admin-bulk-complete", load);
  $("accessory-add").onclick = () => open();
  $("accessory-refresh").onclick = load;
  $("accessory-service").onchange = () => planChoices();
  for (const id of ["accessory-close", "accessory-cancel"])
    $(id).onclick = () => dialog.close();
  $("accessory-search").oninput = render;
  $("accessory-status").onchange = render;
  Promise.all([load(), lookups()]);
})();
