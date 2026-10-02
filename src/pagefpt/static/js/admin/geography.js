/* Import administrative catalog once; customer requests use our database. */
let geographyPreview = null,
  geographyBusy = false,
  geographyPreviewGeneration = 0;
function geographySearchKey(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}
function geographyChoices() {
  const search = geographySearchKey($p("geography-search").value);
  for (const row of $p("geography-provinces").children)
    row.hidden = !geographySearchKey(row.textContent).includes(search);
  geographySummary();
}
function geographySummary() {
  const checked = Array.from(
    $p("geography-provinces").querySelectorAll("input:checked"),
  );
  const selected = new Set(checked.map((c) => Number(c.value)));
  const wards = (geographyPreview?.provinces || [])
    .filter((p) => selected.has(p.code))
    .reduce((n, p) => n + p.ward_count, 0);
  $p("geography-selection").textContent =
    `${checked.length} tỉnh/thành · ${wards.toLocaleString("vi-VN")} xã/phường`;
  $p("geography-submit").disabled = geographyBusy || !checked.length;
  const all = $p("geography-all");
  all.checked =
    checked.length === (geographyPreview?.provinces.length || 0) &&
    checked.length > 0;
  all.indeterminate = checked.length > 0 && !all.checked;
}
function geographySelectAll(checked) {
  for (const input of $p("geography-provinces").querySelectorAll("input"))
    input.checked = checked;
  geographySummary();
}
async function openGeographyDialog() {
  if (geographyBusy || $p("geography-dialog").open) return;
  const generation = ++geographyPreviewGeneration;
  pricingClearError("geography-error");
  $p("geography-result").textContent = "";
  $p("geography-dialog").showModal();
  $p("geography-provinces").textContent = "Đang tải danh mục…";
  $p("geography-submit").disabled = true;
  try {
    const [preview, identity] = await Promise.all([
      pricingApi("/api/v1/admin/locations/source"),
      pricingIdentity
        ? Promise.resolve(pricingIdentity)
        : pricingApi("/api/v1/admin/me"),
    ]);
    if (
      generation !== geographyPreviewGeneration ||
      !$p("geography-dialog").open
    )
      return;
    geographyPreview = preview;
    const provinces = geographyPreview.provinces
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
    $p("geography-provenance").textContent =
      `Province Open API v2 · bản dự phòng tải ${new Date(geographyPreview.fetched_at).toLocaleString("vi-VN")} · ${provinces.length} tỉnh/thành.`;
    const branches = new Set(
      (identity?.memberships || [])
        .filter(
          (m) =>
            m.permissions.includes("*") ||
            m.permissions.includes("catalog.write"),
        )
        .map((m) => m.branch_id),
    );
    $p("geography-branch").replaceChildren();
    for (const branch of branches)
      $p("geography-branch").append(
        new Option(
          branch === PRICING_ZERO
            ? "Danh mục chung (toàn hệ thống)"
            : `Chi nhánh ${branch}`,
          branch,
        ),
      );
    $p("geography-provinces").replaceChildren();
    for (const province of provinces) {
      const label = pricingNode("label", "", "pricing-check");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(province.code);
      checkbox.onchange = geographySummary;
      label.append(
        checkbox,
        document.createTextNode(
          `${province.name} (${province.ward_count} xã/phường)`,
        ),
      );
      $p("geography-provinces").append(label);
    }
    $p("geography-search").value = "";
    geographySelectAll(true);
    const last = geographyPreview.syncs[0];
    $p("geography-result").textContent = last
      ? `Lần đồng bộ gần nhất: ${new Date(last.synced_at).toLocaleString("vi-VN")}.`
      : "";
  } catch (error) {
    if (
      generation === geographyPreviewGeneration &&
      $p("geography-dialog").open
    )
      pricingError("geography-error", error);
  }
}
async function syncGeography(event) {
  event.preventDefault();
  if (geographyBusy) return;
  const codes = Array.from(
    $p("geography-provinces").querySelectorAll("input:checked"),
  ).map((c) => Number(c.value));
  if (!codes.length) return;
  geographyBusy = true;
  geographySummary();
  pricingClearError("geography-error");
  $p("geography-result").textContent = "Đang lấy danh mục và lưu vào database…";
  for (const button of $p("geography-dialog").querySelectorAll(
    "button, input, select",
  ))
    button.disabled = true;
  try {
    const result = await pricingApi(
      "/api/v1/admin/locations/sync",
      "POST",
      {
        branch_id: $p("geography-branch").value,
        province_codes: $p("geography-all").checked ? [] : codes,
        source: $p("geography-source").value,
      },
      25000,
    );
    const mode =
      {
        live: "API trực tiếp",
        cached: "Bản API đã lưu",
        bundled: "Bản dự phòng",
      }[result.source.mode] || "Bản đã lưu";
    $p("geography-result").textContent =
      `${mode} (${new Date(result.source.fetched_at).toLocaleString("vi-VN")}): thêm ${result.created}, cập nhật ${result.updated}, giữ nguyên ${result.skipped} địa bàn có chỉnh sửa hoặc đã ngừng. ${result.source.warning || ""} Bạn có thể chọn địa bàn khi thiết lập gói và giá.`;
    await loadPricesList();
  } catch (error) {
    $p("geography-result").textContent = "";
    pricingError("geography-error", error);
  } finally {
    geographyBusy = false;
    for (const button of $p("geography-dialog").querySelectorAll(
      "button, input, select",
    ))
      button.disabled = false;
    geographySummary();
  }
}
document
  .getElementById("geography-dialog")
  .addEventListener("cancel", (event) => {
    if (geographyBusy) event.preventDefault();
  });

document.getElementById("geography-dialog").addEventListener("close", () => {
  ++geographyPreviewGeneration;
});
