/* Pure presentation policy; all measurement math comes from the Cloudflare engine. */
(function () {
  "use strict";
  const number = (n) =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  function config() {
    return {
      autoStart: false,
      includeCredentials: false,
      logMeasurementApiUrl: null,
      logAimApiUrl: null,
      measureDownloadLoadedLatency: true,
      measureUploadLoadedLatency: true,
      loadedLatencyThrottle: 400,
      bandwidthFinishRequestDuration: 1000,
      bandwidthAbortRequestDuration: 10000,
      measurements: [
        { type: "latency", numPackets: 12 },
        { type: "download", bytes: 100000, count: 2, bypassMinDuration: true },
        { type: "download", bytes: 1000000, count: 3 },
        { type: "download", bytes: 10000000, count: 3 },
        { type: "upload", bytes: 100000, count: 2, bypassMinDuration: true },
        { type: "upload", bytes: 1000000, count: 3 },
        { type: "upload", bytes: 10000000, count: 2 },
      ],
    };
  }
  function snapshot(summary = {}, latencies = [], loaded = {}) {
    const result = {};
    for (const key of [
      "download",
      "upload",
      "latency",
      "jitter",
      "downLoadedLatency",
      "upLoadedLatency",
      "downLoadedJitter",
      "upLoadedJitter",
    ]) {
      const n = number(summary[key]);
      result[key] =
        key === "download" || key === "upload"
          ? n > 0
            ? n / 1000000
            : null
          : n;
    }
    const p = latencies.map(number).filter((x) => x !== null);
    const down = (loaded.download || []).map(number).filter((x) => x !== null);
    const up = (loaded.upload || []).map(number).filter((x) => x !== null);
    if (!p.length) result.latency = null;
    if (p.length < 2) result.jitter = null;
    if (!down.length) result.downLoadedLatency = null;
    if (down.length < 2) result.downLoadedJitter = null;
    if (!up.length) result.upLoadedLatency = null;
    if (up.length < 2) result.upLoadedJitter = null;
    result.pingMin = p.length ? Math.min(...p) : null;
    result.pingMax = p.length ? Math.max(...p) : null;
    result.pingSamples = p.length;
    return result;
  }
  function rank(plans, { regionPath = [], download = null } = {}) {
    const regions = new Set(regionPath);
    const target = number(download);
    function speed(plan) {
      return number(plan.speed_mbps) > 0 ? plan.speed_mbps : Infinity;
    }
    function group(plan) {
      return target > 0 &&
        speed(plan) !== Infinity &&
        speed(plan) >= target * 1.15
        ? 0
        : 1;
    }
    return plans
      .filter((p) => ["internet", "combo", "business"].includes(p.service))
      .filter(
        (p) =>
          !p.applicable_region_ids?.length ||
          p.applicable_region_ids.some((id) => regions.has(id)),
      )
      .sort(
        (a, b) =>
          group(a) - group(b) ||
          speed(a) - speed(b) ||
          String(a.name).localeCompare(String(b.name), "vi") ||
          String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, 3);
  }
  function gauge(mbps) {
    const n = number(mbps);
    return n === null ? 0 : Math.min(1, Math.log10(1 + n) / Math.log10(1001));
  }
  function metadata(headers) {
    function get(key) {
      const v = headers.get(key);
      return typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : null;
    }
    const asn = get("cf-meta-asn");
    return {
      ip: get("cf-meta-ip"),
      asn: asn && /^\d+$/.test(asn) ? "AS" + asn : null,
      colo: get("cf-meta-colo"),
      city: get("cf-meta-city"),
      country: get("cf-meta-country"),
    };
  }
  function metadataIp(value) {
    if (typeof value !== "string" || value.length > 45) return null;
    const ip = value.trim();
    const v4 = (x) =>
      /^\d{1,3}(?:\.\d{1,3}){3}$/.test(x) &&
      x.split(".").every((n) => Number(n) <= 255);
    if (v4(ip)) return ip;
    if (!ip.includes(":")) return null;
    let normalized = ip;
    if (ip.includes(".")) {
      const tail = ip.slice(ip.lastIndexOf(":") + 1);
      if (!v4(tail)) return null;
      normalized = ip.slice(0, ip.lastIndexOf(":") + 1) + "0:0";
    }
    if (
      !/^[0-9a-f:]+$/i.test(normalized) ||
      (normalized.match(/::/g) || []).length > 1
    )
      return null;
    const groups = normalized.split(":").filter(Boolean);
    if (groups.some((x) => x.length > 4)) return null;
    return normalized.includes("::")
      ? groups.length < 8
        ? ip
        : null
      : groups.length === 8
        ? ip
        : null;
  }
  function metadataNetwork(payload) {
    const values = payload?.data?.asns;
    if (!Array.isArray(values) || values.length !== 1) return null;
    const value = String(values[0]);
    return /^\d{1,10}$/.test(value) &&
      Number(value) > 0 &&
      Number(value) <= 4294967295
      ? "AS" + value
      : null;
  }
  function metadataHolder(payload) {
    const value = payload?.data?.holder;
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, 160)
      : null;
  }
  function metadataLocation(payload) {
    const resources = payload?.data?.located_resources;
    if (!Array.isArray(resources) || resources.length !== 1) return null;
    const places = resources[0]?.locations;
    if (!Array.isArray(places) || places.length !== 1) return null;
    const p = places[0];
    if (!p || typeof p.country !== "string" || !/^[A-Z]{2}$/.test(p.country))
      return null;
    return {
      city: typeof p.city === "string" ? p.city.trim().slice(0, 100) : null,
      country: p.country,
    };
  }
  function locationKey(value) {
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
          .replace(
            /^(tinh|thanh pho|tp|city of|province|phuong|xa|thi tran|ward|commune)\s+/,
            "",
          )
          .replace(/\s+(city|province)$/, "")
      : "";
  }
  function locationProvince(place, hierarchy) {
    if (
      place?.countryCode !== "VN" ||
      !/reverse/i.test(place.lookupSource || "")
    )
      return null;
    const key = locationKey(place.principalSubdivision);
    if (!key) return null;
    const matches = Object.entries(hierarchy || {}).flatMap(([zoneId, zone]) =>
      (Array.isArray(zone.provinces) ? zone.provinces : [])
        .filter((p) => locationKey(p.name) === key)
        .map((p) => ({ id: p.code, name: p.name, zoneId })),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  function locationWard(place, wards, accuracy) {
    if (
      place?.countryCode !== "VN" ||
      !/reverse/i.test(place.lookupSource || "") ||
      number(accuracy) === null ||
      accuracy > 10000
    )
      return null;
    const names = [
      place.locality,
      ...(place.localityInfo?.administrative || [])
        .filter((a) => a.adminLevel >= 8)
        .map((a) => a.name),
    ]
      .map(locationKey)
      .filter(Boolean);
    const matches = wards.filter((w) => names.includes(locationKey(w.name)));
    return matches.length === 1 ? matches[0] : null;
  }
  window.PageFPTSpeedModel = {
    config,
    snapshot,
    rank,
    gauge,
    metadata,
    metadataIp,
    metadataNetwork,
    metadataHolder,
    metadataLocation,
    locationProvince,
    locationWard,
  };
})();
