/* Measurement lifecycle and accessible UI. The engine is loaded only after explicit start. */
(function () {
  "use strict";
  const root = document.getElementById("speedtest-console");
  if (!root) return;
  const model = window.PageFPTSpeedModel,
    recs = window.PageFPTSpeedRecommendations;
  const el = (id) => document.getElementById(id),
    text = (id, value) => (el(id).textContent = value);
  const format = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  for (const tick of root.querySelectorAll("[data-speed-tick]")) {
    const angle =
      ((135 + 270 * model.gauge(Number(tick.dataset.speedTick))) * Math.PI) /
      180;
    tick.setAttribute("x", String(200 + 172 * Math.cos(angle)));
    tick.setAttribute("y", String(200 + 172 * Math.sin(angle)));
  }
  el("speedtest-ticks").setAttribute("visibility", "visible");
  let generation = 0,
    engine = null,
    active = false,
    phase = "latency",
    deadline = null,
    metadataController = null,
    metadataTimer = null;
  let started = 0,
    needle = 0,
    target = 0,
    frame = 0,
    lastSnapshot = model.snapshot(),
    summaryForCopy = "",
    usedFetchTiming = false;
  function value(n) {
    return n === null || !Number.isFinite(n) ? "—" : format.format(n);
  }
  function state(name, message) {
    root.dataset.state = name;
    text("speedtest-status", message);
  }
  function dial(n, unit = "Mbps") {
    text("speedtest-dial-value", value(n));
    text("speedtest-dial-unit", unit);
    target = model.gauge(n);
    if (frame) cancelAnimationFrame(frame);
    function paint() {
      needle = motion.matches ? target : needle + (target - needle) * 0.14;
      if (Math.abs(needle - target) < 0.001) needle = target;
      el("speedtest-needle").setAttribute(
        "transform",
        `rotate(${-135 + 270 * needle} 200 200)`,
      );
      el("speedtest-arc").setAttribute(
        "stroke-dasharray",
        `${75 * needle} 100`,
      );
      frame = needle !== target ? requestAnimationFrame(paint) : 0;
    }
    paint();
  }
  function phaseUI(next) {
    phase = next;
    const labels = {
      latency: "Đang đo ping và độ dao động…",
      download: "Đang đo tốc độ tải về…",
      upload: "Đang đo tốc độ tải lên…",
    };
    state(next, labels[next] || "Đang kiểm tra kết nối…");
    text(
      "speedtest-badge",
      next === "latency"
        ? "Đang đo ping"
        : next === "download"
          ? "Đang tải về"
          : "Đang tải lên",
    );
    const order = ["latency", "download", "upload"];
    for (const step of root.querySelectorAll("[data-phase]")) {
      const current = step.dataset.phase === next;
      if (current) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
      step.classList.toggle(
        "is-done",
        order.indexOf(step.dataset.phase) < order.indexOf(next),
      );
    }
    dial(null, next === "latency" ? "ms" : "Mbps");
  }
  function plot(results) {
    const down = results
      .getDownloadBandwidthPoints()
      .filter((p) => Number.isFinite(p.bps) && p.bps > 0)
      .slice(-60);
    const up = results
      .getUploadBandwidthPoints()
      .filter((p) => Number.isFinite(p.bps) && p.bps > 0)
      .slice(-60);
    const max = Math.max(1, ...down.map((p) => p.bps), ...up.map((p) => p.bps));
    const path = (points) =>
      points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${points.length === 1 ? 0 : (i * 800) / (points.length - 1)} ${105 - (p.bps / max) * 90}`,
        )
        .join(" ");
    el("speed-chart-down").setAttribute("d", path(down));
    el("speed-chart-up").setAttribute("d", path(up));
    if (down.length + up.length)
      text(
        "speed-chart-note",
        `${down.length} mẫu download · ${up.length} mẫu upload · Trục ngang: thứ tự mẫu; cùng thang tốc độ, đỉnh ${format.format(max / 1e6)} Mbps.`,
      );
    const all = [...down, ...up];
    const payload = all.reduce(
      (sum, p) => sum + (typeof p.bytes === "number" ? p.bytes : 0),
      0,
    );
    text(
      "speed-transfer",
      all.length ? format.format(payload / 1e6) + " MB" : "—",
    );
  }
  function update(results) {
    if (
      Object.values(results.raw || {}).some((phase) =>
        Object.values(phase?.results || {}).some((bucket) =>
          (bucket.timings || []).some(
            (sample) => sample.timingSource === "fetch",
          ),
        ),
      )
    )
      usedFetchTiming = true;
    lastSnapshot = model.snapshot(
      results.getSummary(),
      results.getUnloadedLatencyPoints(),
      {
        download: results.getDownLoadedLatencyPoints(),
        upload: results.getUpLoadedLatencyPoints(),
      },
    );
    for (const key of [
      "download",
      "upload",
      "latency",
      "jitter",
      "downLoadedLatency",
      "upLoadedLatency",
      "downLoadedJitter",
      "upLoadedJitter",
    ])
      text("speed-" + key, value(lastSnapshot[key]));
    text(
      "speed-ping-samples",
      lastSnapshot.pingSamples ? String(lastSnapshot.pingSamples) : "—",
    );
    text(
      "speed-ping-range",
      lastSnapshot.pingSamples
        ? value(lastSnapshot.pingMin) +
            " / " +
            value(lastSnapshot.pingMax) +
            " ms"
        : "—",
    );
    text(
      "speed-duration",
      format.format((performance.now() - started) / 1000) + " giây",
    );
    plot(results);
    const samples =
      phase === "download"
        ? results.getDownloadBandwidthPoints()
        : phase === "upload"
          ? results.getUploadBandwidthPoints()
          : [];
    const latest = samples
      .filter((p) => Number.isFinite(p.bps) && p.bps > 0)
      .at(-1);
    dial(
      phase === "latency"
        ? lastSnapshot.latency
        : latest
          ? latest.bps / 1e6
          : null,
      phase === "latency" ? "ms" : "Mbps",
    );
  }
  function cleanup() {
    clearTimeout(deadline);
    clearTimeout(metadataTimer);
    metadataController?.abort();
    metadataController = null;
    engine?.pause();
    active = false;
    el("speedtest-start").disabled = false;
    el("speedtest-cancel").hidden = true;
    root.removeAttribute("aria-busy");
    root.querySelector(".speed-primary-metrics").removeAttribute("aria-busy");
    for (const key of ["ip", "isp", "asn", "colo", "location"]) {
      if (el("speed-meta-" + key).textContent === "Đang xác định…")
        text("speed-meta-" + key, "Chưa xác định");
    }
    for (const step of root.querySelectorAll("[aria-current=step]"))
      step.removeAttribute("aria-current");
  }
  function stop(kind, message, resumeQuotes = true) {
    if (!active) return;
    window.PageFPTSpeedLocation?.cancel();
    ++generation;
    cleanup();
    state(kind, message);
    text("speedtest-badge", kind === "error" ? "Chưa hoàn tất" : "Đã dừng");
    text(
      "speed-result-summary",
      "Lượt đo chưa hoàn tất. Các chỉ số có dữ liệu là kết quả tạm thời; bấm đo lại khi sẵn sàng.",
    );
    el("speedtest-start").textContent = "Đo lại";
    recs?.update(null);
    if (resumeQuotes) recs?.pause(false);
  }
  function reset() {
    usedFetchTiming = false;
    lastSnapshot = model.snapshot();
    summaryForCopy = "";
    el("speedtest-copy").hidden = true;
    for (const key of [
      "download",
      "upload",
      "latency",
      "jitter",
      "downLoadedLatency",
      "upLoadedLatency",
      "downLoadedJitter",
      "upLoadedJitter",
    ])
      text("speed-" + key, "—");
    for (const key of [
      "ping-range",
      "ping-samples",
      "duration",
      "transfer",
      "timestamp",
    ])
      text("speed-" + key, "—");
    for (const key of ["down", "up"])
      el("speed-chart-" + key).removeAttribute("d");
    text("speed-chart-note", "Chờ mẫu đo…");
    text("speed-result-summary", "Đang kiểm tra đường truyền.");
    for (const step of root.querySelectorAll("[data-phase]"))
      step.classList.remove("is-done");
    for (const key of ["ip", "isp", "asn", "colo", "location"])
      text("speed-meta-" + key, "Đang xác định…");
    text(
      "speed-meta-connection",
      { wifi: "Wi-Fi", ethernet: "Cáp mạng", cellular: "Mạng di động" }[
        navigator.connection?.type
      ] || "Trình duyệt không cung cấp",
    );
    needle = 0;
    dial(null);
    recs?.pause(true);
    recs?.update(null);
  }
  async function metadata(run) {
    const controller = new AbortController();
    metadataController = controller;
    const timer = setTimeout(() => controller.abort(), 8000);
    metadataTimer = timer;
    const data = {
      ip: null,
      isp: null,
      asn: null,
      colo: null,
      city: null,
      country: null,
    };
    function render() {
      if (run !== generation || !active) return;
      for (const key of ["ip", "isp", "asn", "colo"])
        text("speed-meta-" + key, data[key] || "Không xác định");
      let country = data.country;
      try {
        if (country)
          country = new Intl.DisplayNames(["vi"], { type: "region" }).of(
            country,
          );
      } catch (_) {}
      const locStr = [data.city, country].filter(Boolean).join(", ");
      text(
        "speed-meta-location",
        locStr || "Không xác định",
      );
      if (locStr && typeof window.autoFillInstallationAddress === "function") {
        window.autoFillInstallationAddress(locStr, true);
      }
    }
    await Promise.all(
      [
        ["https://speed.cloudflare.com/__down?bytes=0&pagefpt_meta=1", {}],
        [
          "https://speed.cloudflare.com/__up?pagefpt_meta=1",
          { method: "POST", body: "speedtest" },
        ],
      ].map(async ([url, options]) => {
        try {
          const r = await fetch(url, {
            ...options,
            signal: controller.signal,
            credentials: "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
          });
          if (!r.ok) throw Error("metadata unavailable");
          await r.text();
          if (run !== generation || !active) return;
          const parsed = model.metadata(r.headers);
          for (const key of Object.keys(data))
            if (parsed[key]) data[key] = parsed[key];
        } catch (_) {
          /* Metadata never decides if bandwidth measurement succeeds. */
        }
        render();
      }),
    );
    const ip = model.metadataIp(data.ip);
    if (ip && run === generation && active && !controller.signal.aborted) {
      const get = async (endpoint, resource) => {
        const url = new URL(
          "https://stat.ripe.net/data/" + endpoint + "/data.json",
        );
        url.searchParams.set("resource", resource);
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw Error("network metadata unavailable");
        return response.json();
      };
      await Promise.allSettled([
        (async () => {
          const asn = model.metadataNetwork(await get("network-info", ip));
          if (run !== generation || !active || !asn) return;
          data.asn = asn;
          render();
          const holder = model.metadataHolder(await get("as-overview", asn));
          if (run !== generation || !active) return;
          data.isp = holder;
          render();
        })(),
        (async () => {
          const location = model.metadataLocation(
            await get("maxmind-geo-lite", ip),
          );
          if (run !== generation || !active || !location) return;
          data.city = location.city;
          data.country = location.country;
          render();
        })(),
      ]);
    }
    clearTimeout(timer);
  }
  async function start() {
    if (active) return;
    if (!navigator.onLine) {
      state(
        "error",
        "Thiết bị đang ngoại tuyến. Kết nối Internet rồi bấm đo lại.",
      );
      return;
    }
    active = true;
    const run = ++generation;
    started = performance.now();
    engine = null;
    reset();
    window.PageFPTSpeedLocation?.begin();
    state("preparing", "Đang khởi tạo công cụ đo…");
    text("speedtest-badge", "Đang chuẩn bị");
    root
      .querySelector(".speed-primary-metrics")
      .setAttribute("aria-busy", "true");
    el("speedtest-start").disabled = true;
    el("speedtest-cancel").hidden = false;
    deadline = setTimeout(
      () =>
        stop(
          "error",
          "Lượt đo vượt quá 60 giây. Hãy kiểm tra kết nối và đo lại; các chỉ số hiện có là tạm thời.",
        ),
      60000,
    );
    try {
      const { default: SpeedTest } = await import(
        "/static/js/vendor/cloudflare-speedtest-1.14.1.js"
      );
      if (run !== generation || !active) return;
      engine = new SpeedTest(model.config());
      engine.onPhaseChange = ({ measurement }) => {
        if (
          run === generation &&
          active &&
          ["latency", "download", "upload"].includes(measurement.type) &&
          phase !== measurement.type
        )
          phaseUI(measurement.type);
      };
      engine.onResultsChange = () => {
        if (run === generation && active) update(engine.results);
      };
      engine.onError = () => {
        if (run === generation && active)
          stop(
            "error",
            "Chưa hoàn tất phép đo. Kiểm tra kết nối và bấm đo lại.",
          );
      };
      engine.onFinish = (results) => {
        if (run !== generation || !active) return;
        update(results);
        if (lastSnapshot.download === null || lastSnapshot.upload === null) {
          stop(
            "error",
            "Chưa đủ mẫu hợp lệ để kết luận tốc độ. Hãy thử lại với kết nối ổn định hơn.",
          );
          return;
        }
        ++generation;
        cleanup();
        state(
          "complete",
          usedFetchTiming
            ? "Đo hoàn tất · tốc độ ước tính theo thời gian truyền."
            : "Đo hoàn tất.",
        );
        window.PageFPTSpeedLocation?.complete();
        text("speedtest-badge", "Đo hoàn tất");
        text("speedtest-dial-value", value(lastSnapshot.download));
        text("speedtest-dial-unit", "Mbps · download");
        dial(lastSnapshot.download, "Mbps · download");
        el("speedtest-start").textContent = "Đo lại";
        el("speedtest-copy").hidden = false;
        root
          .querySelectorAll("[data-phase]")
          .forEach((x) => x.classList.add("is-done"));
        const when = new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });
        text("speed-timestamp", when + " (giờ Việt Nam)");
        const duration = results.getTotalDurationMs();
        if (typeof duration === "number" && Number.isFinite(duration))
          text("speed-duration", format.format(duration / 1000) + " giây");
        summaryForCopy = `Đo tốc độ tới Cloudflare · ${when}\nDownload: ${value(lastSnapshot.download)} Mbps\nUpload: ${value(lastSnapshot.upload)} Mbps\nPing: ${value(lastSnapshot.latency)} ms · Jitter: ${value(lastSnapshot.jitter)} ms\nKết quả từ thiết bị tại thời điểm đo, không phải cam kết tốc độ gói.`;
        text("speed-result-summary", "Kết quả tại thời điểm đo.");
        recs?.update(lastSnapshot.download);
        recs?.pause(false);
      };
      void metadata(run);
      if (run !== generation || !active) return;
      phaseUI("latency");
      engine.play();
    } catch (_) {
      if (run === generation && active)
        stop(
          "error",
          "Chưa tải được công cụ đo. Kiểm tra kết nối và bấm đo lại.",
        );
    }
  }
  el("speedtest-start").addEventListener("click", start);
  el("speedtest-cancel").addEventListener("click", () =>
    stop("cancelled", "Đã dừng đo. Bạn có thể bắt đầu một lượt mới."),
  );
  el("speedtest-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(summaryForCopy);
      text(
        "speed-result-summary",
        "Đã sao chép kết quả, không bao gồm IP hoặc thông tin form.",
      );
    } catch (_) {
      text(
        "speed-result-summary",
        "Trình duyệt chưa cho phép sao chép. Bạn có thể chọn các chỉ số trên màn hình.",
      );
    }
  });
  window.addEventListener("offline", () =>
    stop("error", "Kết nối Internet bị ngắt. Kết quả hiện có là tạm thời."),
  );
  window.addEventListener("pagehide", () => {
    stop(
      "cancelled",
      "Đã dừng đo vì bạn rời trang. Bấm đo lại để bắt đầu lượt mới.",
      false,
    );
    if (frame) cancelAnimationFrame(frame);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) recs?.pause(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      stop(
        "cancelled",
        "Đã dừng đo vì bạn rời tab. Giữ trang hiển thị khi đo để kết quả ổn định hơn.",
      );
  });
})();
