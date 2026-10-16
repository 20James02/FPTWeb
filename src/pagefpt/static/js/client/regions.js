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
let clientLocationExplicit = false;
let clientLocationSource = "fallback";
let clientLocationPendingWard = "";
let clientAutoLocationAbort = null;
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
function clientLocationKey(value) {
  return typeof value === "string"
    ? value
        .slice(0, 200)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/gi, "d")
        .toLowerCase()
        .replace(/[.,-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^(tinh|thanh pho|tp|province|city of)\s+/, "")
        .replace(/\s+(province|city)$/, "")
    : "";
}
function matchIpProvince(place, hierarchy) {
  if (
    place?.status !== "estimated" ||
    place.country !== "VN" ||
    !["vercel", "geoip"].includes(place.source)
  )
    return null;
  // A province label outranks a city: never substitute another city on a miss.
  const names = (
    place.province_name
      ? [place.province_name, place.subdivision_code]
      : [place.subdivision_code, place.city]
  )
    .map(clientLocationKey)
    .filter(Boolean);
  if (!names.length) return null;
  const matches = Object.entries(hierarchy || {}).flatMap(([zoneId, zone]) =>
    (zone.provinces || [])
      .filter((p) =>
        [p.name, ...(p.aliases || [])]
          .map(clientLocationKey)
          .some((n) => names.includes(n)),
      )
      .map((p) => ({ id: p.code, name: p.name, zoneId })),
  );
  return matches.length === 1 ? matches[0] : null;
}
function hasSavedClientLocation() {
  const saved = locationStorageGet("pagefpt_selected_province");
  return Boolean(
    saved &&
      Object.values(cachedRegionsHierarchy || {}).some((z) =>
        z.provinces?.some((p) => p.code === saved),
      ),
  );
}
function setClientLocationHint(message = "") {
  const status = document.getElementById("client-location-status");
  if (status) {
    status.textContent = message;
    status.hidden = !message;
  }
}
async function autoSelectClientLocation() {
  if (
    clientLocationExplicit ||
    hasSavedClientLocation() ||
    !Object.keys(cachedRegionsHierarchy || {}).length
  )
    return;
  if (
    typeof document.body?.dataset?.landingPreview === "string" &&
    document.body.dataset.landingPreview === "true"
  )
    return;
  const version = clientLocationGeneration;
  const controller = new AbortController();
  clientAutoLocationAbort = controller;
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("/api/v1/regions/location-suggestion", {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!response.ok) return;
    const hint = await response.json();
    if (
      controller.signal.aborted ||
      clientLocationExplicit ||
      version !== clientLocationGeneration
    )
      return;
    const choice = matchIpProvince(hint, cachedRegionsHierarchy);
    const select =
      document.getElementById("home-province-select") ||
      document.getElementById("form-lead-province");
    if (!choice || !select) return;
    populateProvinceSelect(select, choice.zoneId, choice.id);
    select.value = choice.id;
    // Updates both selectors and pricing through the existing region-change flow.
    const applied = handleProvinceSelected(select, null, "", "ip");
    setClientLocationHint(
      "Khu vực ước tính theo IP: " +
        choice.name +
        ". Chọn xã/phường hoặc đổi tỉnh theo địa chỉ lắp đặt.",
    );
    await applied;
  } catch (_) {
    // Detection is optional: current prices and manual selection remain available.
  } finally {
    clearTimeout(timer);
    if (clientAutoLocationAbort === controller) clientAutoLocationAbort = null;
  }
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
  const shortProv = (province.name || "Chọn khu vực").replace(/^(Thành phố|Tỉnh)\s+/i, "");
  const name = [province.wardName, province.name].filter(Boolean).join(", ");
  for (const id of ["header-current-province", "current-region-label"]) {
    const label = document.getElementById(id);
    if (label) {
      label.textContent =
        id === "header-current-province"
          ? shortProv
          : (province.wardName ? [province.wardName, shortProv].join(", ") : shortProv);
      label.title = name || "Chọn khu vực";
    }
  }
  const badge = document.getElementById("active-province-badge");
  if (badge) {
    const strong = document.createElement("strong");
    strong.textContent = name || "Chưa chọn địa bàn";
    badge.replaceChildren(document.createTextNode("Địa bàn: "), strong);
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
  if (
    typeof document.dispatchEvent === "function" &&
    typeof CustomEvent === "function"
  )
    document.dispatchEvent(new CustomEvent("pagefpt:location-change"));
}
function selectClientWard(id) {
  ++clientLocationGeneration;
  clientLocationExplicit = true;
  clientLocationSource = "manual";
  clientLocationPendingWard = "";
  clientAutoLocationAbort?.abort();
  setClientLocationHint();
  currentSelectedProvince.wardId = id || "";
  const ward = clientWardCache
    .get(currentSelectedProvince.code)
    ?.find((w) => w.id === id);
  currentSelectedProvince.wardName = ward?.name || "";
  // A manual ward selection confirms its parent even when the province came from IP.
  locationStorageSet("pagefpt_selected_zone", currentSelectedProvince.zoneId);
  locationStorageSet("pagefpt_selected_province", currentSelectedProvince.code);
  locationStorageSet(
    "pagefpt_selected_province_name",
    currentSelectedProvince.name,
  );
  locationStorageSet("pagefpt_selected_ward", currentSelectedProvince.wardId);
  for (const [, , wardId] of locationPairs) {
    const select = document.getElementById(wardId);
    if (select) select.value = currentSelectedProvince.wardId;
  }
  notifyClientLocation();
}
async function handleProvinceSelected(
  select,
  callback,
  savedWard = "",
  source = "manual",
) {
  const option = select.options[select.selectedIndex];
  if (!option) return;
  const generation = ++clientLocationGeneration;
  clientLocationSource = source;
  clientLocationPendingWard = savedWard;
  if (["manual", "saved"].includes(source)) {
    clientLocationExplicit = true;
    clientAutoLocationAbort?.abort();
    setClientLocationHint();
  }
  currentSelectedProvince = {
    zoneId: option.dataset.zoneId || "",
    zoneName: option.dataset.zoneName || "",
    code: option.value,
    name: option.value ? option.textContent : "",
    priceGroup: option.dataset.priceGroup || "",
    wardId: "",
    wardName: "",
  };
  if (["manual", "saved"].includes(source)) {
    locationStorageSet("pagefpt_selected_zone", currentSelectedProvince.zoneId);
    locationStorageSet(
      "pagefpt_selected_province",
      currentSelectedProvince.code,
    );
    locationStorageSet(
      "pagefpt_selected_province_name",
      currentSelectedProvince.name,
    );
    locationStorageSet("pagefpt_selected_ward", savedWard);
  }
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
        new Option(rows.length ? "Chọn xã/phường" : "Chưa có xã/phường", ""),
      );
      for (const row of rows) ward.append(new Option(row.name, row.id));
      ward.disabled = !rows.length;
    }
    if (savedWard && rows.some((w) => w.id === savedWard))
      selectClientWard(savedWard);
    else {
      clientLocationPendingWard = "";
      if (savedWard) locationStorageSet("pagefpt_selected_ward", "");
    }
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
  if (select) {
    const saved = hasSavedClientLocation();
    const initial = handleProvinceSelected(
      select,
      null,
      saved ? savedWard : "",
      saved ? "saved" : "fallback",
    );
    // Province price rendering and IP lookup do not wait for the ward request.
    void autoSelectClientLocation();
    await initial;
  }
});
if (typeof window !== "undefined")
  window.addEventListener?.("pagehide", () => {
    ++clientLocationGeneration;
    clientAutoLocationAbort?.abort();
  });
if (typeof window !== "undefined")
  window.addEventListener?.("pageshow", async (event) => {
    if (!event.persisted) return;
    const select =
      document.getElementById("home-province-select") ||
      document.getElementById("form-lead-province");
    if (!select?.value) return;
    const source = clientLocationSource;
    const restored = handleProvinceSelected(
      select,
      null,
      currentSelectedProvince.wardId || clientLocationPendingWard,
      source,
    );
    if (!clientLocationExplicit && source === "ip")
      setClientLocationHint(
        "Khu vực ước tính theo IP: " +
          currentSelectedProvince.name +
          ". Chọn xã/phường hoặc đổi tỉnh theo địa chỉ lắp đặt.",
      );
    if (source === "fallback") void autoSelectClientLocation();
    await restored;
  });
