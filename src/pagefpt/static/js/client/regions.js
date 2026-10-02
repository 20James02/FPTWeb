/** Two-level published geography; ward requests are lazy and generation-fenced. */
let cachedRegionsHierarchy = null,
  regionHierarchyPromise = null;
let currentSelectedProvince = {
  zoneId: "",
  zoneName: "",
  code: "",
  name: "",
  priceGroup: "",
  wardId: "",
  wardName: "",
};
let clientLocationGeneration = 0;
const clientWardCache = new Map();
const locationPairs = [
  ["home-zone-select", "home-province-select", "home-ward-select"],
  ["form-lead-zone", "form-lead-province", "form-lead-ward"],
];
function getSelectedRegionId() {
  return currentSelectedProvince.wardId || currentSelectedProvince.code || null;
}
function getSelectedRegionPath() {
  return [currentSelectedProvince.wardId, currentSelectedProvince.code].filter(
    Boolean,
  );
}
function locationStorageGet(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch (_) {
    return "";
  }
}
function locationStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
}
async function fetchRegionsHierarchy() {
  if (cachedRegionsHierarchy) return cachedRegionsHierarchy;
  if (!regionHierarchyPromise)
    regionHierarchyPromise = (async () => {
      try {
        const response = await fetch("/api/v1/regions/hierarchy", {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error();
        cachedRegionsHierarchy = await response.json();
        return cachedRegionsHierarchy;
      } catch (_) {
        regionHierarchyPromise = null;
        return {};
      }
    })();
  return regionHierarchyPromise;
}
async function fetchLocationWards(province) {
  if (!province) return [];
  if (clientWardCache.has(province)) return clientWardCache.get(province);
  const rows = [];
  let cursor = null;
  do {
    const response = await fetch(
      "/api/v1/regions/" +
        encodeURIComponent(province) +
        "/wards?limit=100" +
        (cursor ? "&before=" + encodeURIComponent(cursor) : ""),
      { signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok)
      throw new Error(
        "Chưa tải được xã/phường. Chọn lại tỉnh/thành để thử lại.",
      );
    const data = await response.json();
    rows.push(...data.items);
    cursor = data.next_cursor;
  } while (cursor);
  rows.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  clientWardCache.set(province, rows);
  return rows;
}
function populateProvinceSelect(select, zoneId, selected) {
  if (!select) return;
  select.replaceChildren();
  const zone =
    zoneId === "all"
      ? {
          name: "Tất cả tỉnh/thành",
          provinces: Object.values(cachedRegionsHierarchy || {})
            .flatMap((z) => z.provinces)
            .sort((a, b) => a.name.localeCompare(b.name, "vi")),
        }
      : cachedRegionsHierarchy?.[zoneId];
  if (!zone?.provinces?.length) {
    select.append(new Option("Chưa có địa bàn được công bố", ""));
    return;
  }
  for (const p of zone.provinces) {
    const option = new Option(p.name, p.code);
    option.dataset.zoneId = zoneId;
    option.dataset.zoneName = zone.name;
    option.dataset.priceGroup = p.price_group || "";
    select.append(option);
  }
  if (zone.provinces.some((p) => p.code === selected)) select.value = selected;
}
function syncSelectedProvinceToUI(province) {
  const name = [province.wardName, province.name].filter(Boolean).join(", ");
  for (const id of ["header-current-province", "current-region-label"]) {
    const label = document.getElementById(id);
    if (label) label.textContent = name || "Chọn địa bàn";
  }
  const badge = document.getElementById("active-province-badge");
  if (badge) {
    const strong = document.createElement("strong");
    strong.textContent = name || "Chưa chọn địa bàn";
    badge.replaceChildren(
      document.createTextNode("Đang xem giá tại: "),
      strong,
    );
  }
}
function syncAllProvinceInputs(province) {
  for (const [zoneId, provinceId, wardId] of locationPairs) {
    const zone = document.getElementById(zoneId),
      select = document.getElementById(provinceId);
    if (zone) zone.value = province.zoneId;
    if (select) {
      populateProvinceSelect(select, province.zoneId, province.code);
      select.value = province.code;
    }
    const ward = document.getElementById(wardId);
    if (ward) ward.value = province.wardId || "";
  }
}
function notifyClientLocation() {
  syncSelectedProvinceToUI(currentSelectedProvince);
  const region = getSelectedRegionId();
  if (typeof refreshActiveQuote === "function") refreshActiveQuote(region);
  if (typeof refreshCatalogPrices === "function") refreshCatalogPrices(region);
}
function selectClientWard(id) {
  currentSelectedProvince.wardId = id || "";
  const ward = clientWardCache
    .get(currentSelectedProvince.code)
    ?.find((w) => w.id === id);
  currentSelectedProvince.wardName = ward?.name || "";
  locationStorageSet("pagefpt_selected_ward", currentSelectedProvince.wardId);
  for (const [, , wardId] of locationPairs) {
    const select = document.getElementById(wardId);
    if (select) select.value = currentSelectedProvince.wardId;
  }
  notifyClientLocation();
}
async function handleProvinceSelected(select, callback, savedWard = "") {
  const option = select.options[select.selectedIndex];
  if (!option) return;
  const generation = ++clientLocationGeneration;
  currentSelectedProvince = {
    zoneId: option.dataset.zoneId || "",
    zoneName: option.dataset.zoneName || "",
    code: option.value,
    name: option.value ? option.textContent : "",
    priceGroup: option.dataset.priceGroup || "",
    wardId: "",
    wardName: "",
  };
  locationStorageSet("pagefpt_selected_zone", currentSelectedProvince.zoneId);
  locationStorageSet("pagefpt_selected_province", currentSelectedProvince.code);
  locationStorageSet(
    "pagefpt_selected_province_name",
    currentSelectedProvince.name,
  );
  locationStorageSet("pagefpt_selected_ward", "");
  syncAllProvinceInputs(currentSelectedProvince);
  for (const [, , wardId] of locationPairs) {
    const ward = document.getElementById(wardId);
    if (ward) {
      ward.replaceChildren(
        new Option(
          currentSelectedProvince.code
            ? "Đang tải xã/phường…"
            : "Chọn tỉnh/thành trước",
          "",
        ),
      );
      ward.disabled = true;
    }
  }
  notifyClientLocation();
  if (typeof callback === "function") callback(currentSelectedProvince);
  if (!currentSelectedProvince.code) return;
  try {
    const rows = await fetchLocationWards(currentSelectedProvince.code);
    if (generation !== clientLocationGeneration) return;
    for (const [, , wardId] of locationPairs) {
      const ward = document.getElementById(wardId);
      if (!ward) continue;
      ward.replaceChildren(
        new Option(
          rows.length
            ? "Chọn xã/phường (không bắt buộc)"
            : "Chưa cấu hình xã/phường — dùng giá tỉnh",
          "",
        ),
      );
      for (const row of rows) ward.append(new Option(row.name, row.id));
      ward.disabled = !rows.length;
    }
    if (savedWard && rows.some((w) => w.id === savedWard))
      selectClientWard(savedWard);
  } catch (_) {
    if (generation !== clientLocationGeneration) return;
    for (const [, , wardId] of locationPairs) {
      const ward = document.getElementById(wardId);
      if (ward)
        ward.replaceChildren(
          new Option("Chưa tải được — chọn lại tỉnh để thử", ""),
        );
    }
  }
}
async function setupCascadingComboboxes(zone, province, callback) {
  if (!zone || !province) return;
  const data = await fetchRegionsHierarchy();
  const keys = Object.keys(data);
  zone.replaceChildren();
  if (keys.length) zone.append(new Option("Tất cả tỉnh/thành", "all"));
  for (const key of keys) zone.append(new Option(data[key].name, key));
  if (!keys.length) {
    zone.append(new Option("Chưa có địa bàn", ""));
    province.replaceChildren(new Option("Chưa có tỉnh/thành được công bố", ""));
    return;
  }
  zone.value =
    currentSelectedProvince.zoneId === "all" ||
    data[currentSelectedProvince.zoneId]
      ? currentSelectedProvince.zoneId
      : "all";
  populateProvinceSelect(province, zone.value, currentSelectedProvince.code);
  zone.addEventListener("change", () => {
    populateProvinceSelect(province, zone.value);
    handleProvinceSelected(province, callback);
  });
  province.addEventListener("change", () =>
    handleProvinceSelected(province, callback),
  );
}
document.addEventListener("DOMContentLoaded", async () => {
  const data = await fetchRegionsHierarchy();
  const zoneId =
    locationStorageGet("pagefpt_selected_zone") === "all" ||
    data[locationStorageGet("pagefpt_selected_zone")]
      ? locationStorageGet("pagefpt_selected_zone")
      : Object.keys(data).length
        ? "all"
        : "";
  if (zoneId) currentSelectedProvince.zoneId = zoneId;
  currentSelectedProvince.code = locationStorageGet(
    "pagefpt_selected_province",
  );
  const savedWard = locationStorageGet("pagefpt_selected_ward");
  for (const [zoneId, provinceId, wardId] of locationPairs) {
    const zone = document.getElementById(zoneId),
      province = document.getElementById(provinceId),
      ward = document.getElementById(wardId);
    await setupCascadingComboboxes(zone, province);
    if (ward)
      ward.addEventListener("change", () => selectClientWard(ward.value));
  }
  const select =
    document.getElementById("home-province-select") ||
    document.getElementById("form-lead-province");
  if (select) await handleProvinceSelected(select, null, savedWard);
});
