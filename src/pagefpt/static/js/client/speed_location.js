/* Optional device location; never blocks measurement or persists coordinates. */
(function () {
  "use strict";
  const status = document.getElementById("speed-location-status"),
    button = document.getElementById("speed-location-apply"),
    model = window.PageFPTSpeedModel;
  if (!status || !button) return;
  let generation = 0,
    measuring = false,
    coordinates = null,
    pending = false,
    controller = null,
    permissionTimer = null,
    suggestion = null;
  function invalidate() {
    ++generation;
    clearTimeout(permissionTimer);
    controller?.abort();
    controller = null;
    coordinates = suggestion = null;
    pending = measuring = false;
    button.hidden = true;
  }
  function cancel() {
    const waiting = pending || coordinates || controller || suggestion;
    invalidate();
    if (waiting)
      status.textContent =
        "Đã dừng gợi ý vị trí. Bạn vẫn có thể chọn địa bàn bên dưới.";
  }
  async function lookup(run) {
    if (run !== generation || measuring || !coordinates) return;
    const point = coordinates;
    coordinates = null;
    const request = new AbortController();
    controller = request;
    const timer = setTimeout(() => request.abort(), 5000);
    status.textContent = "Đang đối chiếu vị trí với địa bàn đang cung cấp…";
    try {
      const url = new URL(
        "https://api.bigdatacloud.net/data/reverse-geocode-client",
      );
      url.searchParams.set("latitude", String(point.latitude));
      url.searchParams.set("longitude", String(point.longitude));
      url.searchParams.set("localityLanguage", "vi");
      const [response, hierarchy] = await Promise.all([
        fetch(url, {
          signal: request.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        }),
        fetchRegionsHierarchy(),
      ]);
      if (!response.ok) throw Error("location unavailable");
      const place = await response.json();
      if (run !== generation) return;
      const province = model.locationProvince(place, hierarchy);
      if (!province) {
        status.textContent =
          "Chưa khớp vị trí với danh mục tỉnh/thành đang phục vụ. Hãy chọn địa bàn bên dưới.";
        return;
      }
      let wards = [];
      try {
        wards = await fetchLocationWards(province.id);
      } catch (_) {
        /* Province suggestion remains useful. */
      }
      if (run !== generation) return;
      const ward = model.locationWard(place, wards, point.accuracy);
      suggestion = { province, ward };
      const locationText = [ward?.name, province.name].filter(Boolean).join(", ");
      status.textContent =
        "Địa bàn gợi ý: " +
        locationText +
        ". Vị trí đo có thể khác nơi lắp đặt; hãy xác nhận trước khi xem giá.";
      button.hidden = false;
      button.disabled = false;
      if (typeof window.autoFillInstallationAddress === "function") {
        window.autoFillInstallationAddress(locationText, false);
      }
    } catch (_) {
      if (run === generation)
        status.textContent =
          "Chưa tra được địa bàn từ vị trí. Phép đo vẫn hoạt động; chọn địa bàn thủ công bên dưới.";
    } finally {
      clearTimeout(timer);
      if (run === generation) controller = null;
    }
  }
  function begin() {
    invalidate();
    measuring = true;
    const run = generation;
    if (!navigator.geolocation || !window.isSecureContext) {
      status.textContent =
        "Trình duyệt chưa hỗ trợ chia sẻ vị trí. Bạn vẫn đo và chọn địa bàn bình thường.";
      return;
    }
    pending = true;
    status.textContent =
      "Có thể cho phép vị trí để gợi ý địa bàn. Phép đo tiếp tục dù bạn không cấp quyền.";
    function unavailable(message) {
      if (run !== generation || !pending) return;
      pending = false;
      clearTimeout(permissionTimer);
      status.textContent = message;
    }
    permissionTimer = setTimeout(() => {
      if (run === generation && pending)
        status.textContent =
          "Chưa nhận được vị trí. Phép đo vẫn tiếp tục; bạn có thể chọn địa bàn thủ công.";
    }, 8000);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (run !== generation || !pending) return;
          const { latitude, longitude, accuracy } = position.coords;
          if (
            ![latitude, longitude, accuracy].every(Number.isFinite) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180 ||
            accuracy < 0 ||
            accuracy > 50000
          ) {
            unavailable(
              "Vị trí chưa đủ rõ để gợi ý địa bàn. Hãy chọn địa bàn thủ công; phép đo vẫn tiếp tục.",
            );
            return;
          }
          pending = false;
          clearTimeout(permissionTimer);
          coordinates = { latitude, longitude, accuracy };
          status.textContent =
            "Đã nhận vị trí. Địa bàn sẽ được gợi ý sau khi phép đo hoàn tất.";
          if (!measuring) lookup(run);
        },
        (error) =>
          unavailable(
            error.code === 1
              ? "Bạn không chia sẻ vị trí. Phép đo vẫn hoạt động; chọn địa bàn thủ công bên dưới."
              : "Chưa lấy được vị trí. Phép đo vẫn hoạt động; chọn địa bàn thủ công bên dưới.",
          ),
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 0 },
      );
    } catch (_) {
      unavailable(
        "Chưa lấy được vị trí. Bạn vẫn đo và chọn địa bàn bình thường.",
      );
    }
  }
  button.addEventListener("click", async () => {
    if (!suggestion || measuring) return;
    const run = generation,
      choice = suggestion;
    button.disabled = true;
    const select = document.getElementById("home-province-select");
    try {
      populateProvinceSelect(
        select,
        choice.province.zoneId,
        choice.province.id,
      );
      select.value = choice.province.id;
      const locationVersion = clientLocationGeneration + 1;
      await handleProvinceSelected(select);
      if (run !== generation) return;
      if (
        clientLocationGeneration !== locationVersion ||
        currentSelectedProvince.code !== choice.province.id
      ) {
        status.textContent = "Đã giữ địa bàn bạn vừa chọn thủ công.";
      } else {
        if (choice.ward) selectClientWard(choice.ward.id);
        status.textContent =
          "Đã dùng địa bàn gợi ý để xem gói và giá. Bạn có thể đổi địa bàn bên dưới.";
      }
      suggestion = null;
      button.hidden = true;
    } catch (_) {
      if (run === generation)
        status.textContent =
          "Chưa áp dụng được gợi ý. Hãy chọn địa bàn thủ công bên dưới.";
    } finally {
      if (run === generation) button.disabled = false;
    }
  });
  window.PageFPTSpeedLocation = {
    begin,
    complete() {
      measuring = false;
      lookup(generation);
    },
    cancel,
  };
  window.addEventListener("pagehide", cancel);
  window.addEventListener("offline", cancel);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancel();
  });
})();
