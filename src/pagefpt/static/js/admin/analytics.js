/** 
 * PAGEFPT ENTERPRISE ADMIN ANALYTICS & SAAS DASHBOARD
 * Powered by ApexCharts & Modern Responsive Metric Components
 */
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$("analytics-dashboard")) return;

  const COLORS = [
    "#2563eb", // Blue
    "#7c3aed", // Purple
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#06b6d4", // Cyan
    "#ec4899", // Pink
    "#f97316", // Orange
    "#64748b"  // Slate
  ];

  let sequence = 0,
    timer,
    resizeTimer,
    trendRows = null;

  // Cache các instance ApexCharts để destroy trước khi render mới
  const apexCharts = {};

  function destroyChart(id) {
    if (apexCharts[id]) {
      try {
        apexCharts[id].destroy();
      } catch (e) {
        /* ignore */
      }
      apexCharts[id] = null;
    }
  }

  function destroyAllCharts() {
    for (const key of Object.keys(apexCharts)) {
      destroyChart(key);
    }
  }

  const number = (value) => new Intl.NumberFormat("vi-VN").format(value || 0);
  const percent = (value, total) =>
    total
      ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(
          (value / total) * 100,
        ) + "%"
      : "—";

  function table(headers, rows) {
    const wrap = adminNode("div", "", "analytics-table-scroll"),
      tab = document.createElement("table"),
      head = document.createElement("thead"),
      tr = document.createElement("tr");
    for (const h of headers) {
      const cell = adminNode("th", h);
      cell.scope = "col";
      tr.append(cell);
    }
    head.append(tr);
    tab.append(head);
    const body = document.createElement("tbody");
    for (const row of rows) {
      const line = document.createElement("tr");
      for (const value of row) line.append(adminNode("td", String(value)));
      body.append(line);
    }
    tab.append(body);
    wrap.append(tab);
    return wrap;
  }

  function details(headers, rows) {
    const detail = document.createElement("details");
    detail.className = "analytics-table-details";
    detail.append(
      adminNode("summary", "📋 Xem bảng dữ liệu chi tiết"),
      table(headers, rows),
    );
    return detail;
  }

  function svgNode(name, attributes = {}) {
    const item = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes))
      item.setAttribute(key, String(value));
    return item;
  }

  /* ===================================================================
     FALLBACK BARS & SVG (Dùng khi ApexCharts chưa tải hoặc môi trường test)
     =================================================================== */
  function fallbackBars(id, rows, total) {
    const container = $(id);
    container.replaceChildren();
    if (!rows.length) {
      container.append(
        adminNode("p", "Chưa có dữ liệu trong kỳ này.", "analytics-empty"),
      );
      return;
    }
    const sorted = [...rows].sort((a, b) => b.value - a.value),
      visible = sorted.slice(0, 10);
    if (sorted.length > 10)
      visible.push({
        label: "Các nhóm còn lại",
        value: sorted.slice(10).reduce((a, b) => a + b.value, 0),
      });
    const max = Math.max(...visible.map((r) => r.value), 1),
      list = adminNode("div", "", "analytics-bars");
    for (const [index, row] of visible.entries()) {
      const item = adminNode("div"),
        label = adminNode("div", "", "analytics-bar-label");
      label.append(
        adminNode("span", row.label),
        adminNode(
          "strong",
          number(row.value) + " · " + percent(row.value, total),
        ),
      );
      const track = adminNode("div", "", "analytics-bar-track"),
        fill = adminNode("div", "", "analytics-bar-fill");
      fill.style.width = (row.value / max) * 100 + "%";
      fill.style.setProperty("--chart-color", COLORS[index % COLORS.length]);
      track.setAttribute("aria-hidden", "true");
      track.append(fill);
      item.append(label, track);
      list.append(item);
    }
    container.append(
      list,
      details(
        ["Nhóm", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
        rows.map((r) => [
          r.label,
          number(r.value),
          percent(r.value, total),
          r.installed == null ? "—" : number(r.installed),
        ]),
      ),
    );
  }

  function fallbackTrend(rows) {
    const container = $("analytics-trend");
    container.replaceChildren();
    const series = [
      ["leads", "Tiếp nhận"],
      ["qualified", "Đủ điều kiện"],
      ["installed", "Đã lắp đặt"],
    ];
    const legend = adminNode("div", "", "analytics-legend");
    series.forEach(([key, label], i) => {
      const item = adminNode("span"),
        swatch = adminNode("i", "", "analytics-key");
      swatch.style.setProperty("--chart-color", COLORS[i]);
      swatch.setAttribute("aria-hidden", "true");
      item.append(swatch, document.createTextNode(label));
      legend.append(item);
    });
    container.append(legend);
    if (rows.some((r) => r.leads)) {
      const width = Math.max(280, Math.min(760, container.clientWidth)),
        height = 270,
        left = 45,
        right = 20,
        top = 20,
        bottom = 40,
        max = Math.max(1, ...rows.map((r) => r.leads));
      const x = (i) =>
          left + (i * (width - left - right)) / Math.max(1, rows.length - 1),
        y = (value) =>
          height - bottom - (value / max) * (height - top - bottom);
      const svg = svgNode("svg", {
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label":
          "Xu hướng hồ sơ tiếp nhận, đủ điều kiện và lắp đặt. Xem bảng dữ liệu bên dưới.",
        class: "analytics-svg",
      });
      const steps = Math.min(4, max);
      for (let i = 0; i <= steps; i++) {
        const value = (max * i) / steps;
        svg.append(
          svgNode("line", {
            x1: left,
            y1: y(value),
            x2: width - right,
            y2: y(value),
            stroke: "currentColor",
            "stroke-opacity": ".15",
          }),
        );
        const text = svgNode("text", {
          x: left - 8,
          y: y(value) + 4,
          "text-anchor": "end",
        });
        text.textContent = number(Math.round(value));
        svg.append(text);
      }
      series.forEach(([key, label], j) => {
        svg.append(
          svgNode("polyline", {
            points: rows.map((r, i) => `${x(i)},${y(r[key])}`).join(" "),
            fill: "none",
            stroke: COLORS[j],
            "stroke-width": 2.5,
            "stroke-dasharray": j === 1 ? "7 4" : j === 2 ? "2 4" : "none",
          }),
        );
      });
      container.append(svg);
    } else {
      container.append(
        adminNode("p", "Chưa có hồ sơ tiếp nhận trong kỳ này.", "analytics-empty"),
      );
    }
    container.append(
      details(
        ["Ngày", "Tiếp nhận", "Đã liên hệ", "Đủ điều kiện", "Đã lắp đặt"],
        rows.map((r) => [
          PageFPTDates.format(r.day, false) || r.day,
          number(r.leads),
          number(r.contacted),
          number(r.qualified),
          number(r.installed),
        ]),
      ),
    );
  }

  /* ===================================================================
     RENDER BIỂU ĐỒ APEXCHARTS CAO CẤP
     =================================================================== */

  // 1. Xu hướng tiếp nhận (Area Spline Chart)
  function trendApex(rows) {
    destroyChart("analytics-trend");
    const container = $("analytics-trend");
    container.replaceChildren();

    if (!window.ApexCharts) {
      fallbackTrend(rows);
      return;
    }

    if (!rows.length || !rows.some((r) => r.leads || r.qualified || r.installed)) {
      container.append(
        adminNode("p", "Chưa có dữ liệu hồ sơ trong kỳ này.", "analytics-empty"),
      );
      container.append(
        details(
          ["Ngày", "Tiếp nhận", "Đã liên hệ", "Đủ điều kiện", "Đã lắp đặt"],
          rows.map((r) => [
            PageFPTDates.format(r.day, false) || r.day,
            number(r.leads),
            number(r.contacted),
            number(r.qualified),
            number(r.installed),
          ]),
        ),
      );
      return;
    }

    const categories = rows.map((r) => {
      try {
        return PageFPTDates.format(r.day, false) || r.day;
      } catch (e) {
        return r.day;
      }
    });

    const chartWrap = adminNode("div", "", "apex-chart-container");
    container.append(chartWrap);

    const options = {
      series: [
        { name: "Tiếp nhận", data: rows.map((r) => r.leads || 0) },
        { name: "Đủ điều kiện", data: rows.map((r) => r.qualified || 0) },
        { name: "Đã lắp đặt", data: rows.map((r) => r.installed || 0) },
      ],
      chart: {
        type: "area",
        height: 320,
        toolbar: {
          show: true,
          tools: { download: true, zoom: true, reset: true },
        },
        animations: { enabled: true, easing: "easeinout", speed: 700 },
        fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
      },
      colors: ["#2563eb", "#8b5cf6", "#10b981"],
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.8 },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.45,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      xaxis: {
        categories: categories,
        labels: {
          rotate: -25,
          rotateAlways: rows.length > 15,
          style: { fontSize: "11px", colors: "#64748b" },
        },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { fontSize: "11px", colors: "#64748b" },
          formatter: (val) => number(Math.round(val)),
        },
      },
      legend: {
        position: "top",
        horizontalAlign: "right",
        labels: { colors: "#334155" },
        markers: { radius: 12 },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: { formatter: (val) => number(val) + " hồ sơ" },
      },
      grid: {
        borderColor: "rgba(226, 232, 240, 0.8)",
        strokeDashArray: 4,
      },
    };

    try {
      const chart = new ApexCharts(chartWrap, options);
      chart.render();
      apexCharts["analytics-trend"] = chart;
    } catch (e) {
      console.warn("ApexCharts trend failed, falling back:", e);
      fallbackTrend(rows);
      return;
    }

    container.append(
      details(
        ["Ngày", "Tiếp nhận", "Đã liên hệ", "Đủ điều kiện", "Đã lắp đặt"],
        rows.map((r) => [
          PageFPTDates.format(r.day, false) || r.day,
          number(r.leads),
          number(r.contacted),
          number(r.qualified),
          number(r.installed),
        ]),
      ),
    );
  }

  // 2. Phễu chuyển đổi (Funnel Bar Chart)
  function funnelApex(id, items, total) {
    destroyChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.ApexCharts) {
      fallbackBars(id, items, total);
      return;
    }

    const chartWrap = adminNode("div", "", "apex-chart-container");
    container.append(chartWrap);

    const categories = items.map((r) => r.label);
    const values = items.map((r) => r.value || 0);

    const options = {
      series: [{ name: "Số lượng", data: values }],
      chart: {
        type: "bar",
        height: 240,
        toolbar: { show: false },
        animations: { enabled: true, speed: 600 },
        fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
      },
      plotOptions: {
        bar: {
          borderRadius: 8,
          horizontal: true,
          distributed: true,
          barHeight: "52%",
          dataLabels: { position: "bottom" },
        },
      },
      colors: ["#2563eb", "#7c3aed", "#f59e0b", "#10b981"],
      dataLabels: {
        enabled: true,
        textAnchor: "start",
        style: { colors: ["#ffffff"], fontSize: "12px", fontWeight: 700 },
        formatter: function (val, opt) {
          return opt.w.globals.labels[opt.dataPointIndex] + ": " + number(val) + " (" + percent(val, total) + ")";
        },
        offsetX: 10,
        dropShadow: { enabled: true, top: 1, left: 1, blur: 2, opacity: 0.5 },
      },
      xaxis: {
        categories: categories,
        labels: {
          style: { fontSize: "11px", colors: "#64748b" },
          formatter: (v) => number(v),
        },
      },
      yaxis: { labels: { show: false } },
      legend: { show: false },
      tooltip: {
        y: {
          formatter: (val) => number(val) + " hồ sơ (" + percent(val, total) + " trên tổng)",
        },
      },
      grid: {
        borderColor: "rgba(226, 232, 240, 0.6)",
        strokeDashArray: 4,
      },
    };

    try {
      const chart = new ApexCharts(chartWrap, options);
      chart.render();
      apexCharts[id] = chart;
    } catch (e) {
      fallbackBars(id, items, total);
      return;
    }

    container.append(
      details(
        ["Giai đoạn", "Số hồ sơ", "Tỷ lệ / Tổng", "Đã lắp đặt"],
        items.map((r) => [
          r.label,
          number(r.value),
          percent(r.value, total),
          r.installed == null ? "—" : number(r.installed),
        ]),
      ),
    );
  }

  // 3. Cơ cấu & Trạng thái (Donut Charts)
  function donutApex(id, rows, total, centerLabel = "Tổng số") {
    destroyChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.ApexCharts) {
      fallbackBars(id, rows, total);
      return;
    }

    if (!rows.length || !rows.some((r) => r.value > 0)) {
      container.append(
        adminNode("p", "Chưa có dữ liệu trong kỳ này.", "analytics-empty"),
      );
      container.append(
        details(
          ["Nhóm", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
          rows.map((r) => [
            r.label,
            number(r.value),
            percent(r.value, total),
            r.installed == null ? "—" : number(r.installed),
          ]),
        ),
      );
      return;
    }

    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const visible = sorted.slice(0, 6);
    if (sorted.length > 6) {
      visible.push({
        label: "Khác",
        value: sorted.slice(6).reduce((a, b) => a + b.value, 0),
      });
    }

    const chartWrap = adminNode("div", "", "apex-chart-container");
    container.append(chartWrap);

    const series = visible.map((r) => r.value);
    const labels = visible.map((r) => r.label);

    const options = {
      series: series,
      labels: labels,
      chart: {
        type: "donut",
        height: 260,
        animations: { enabled: true, speed: 600 },
        fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
      },
      colors: COLORS,
      plotOptions: {
        pie: {
          donut: {
            size: "68%",
            labels: {
              show: true,
              total: {
                show: true,
                label: centerLabel,
                fontSize: "13px",
                fontWeight: 600,
                color: "#64748b",
                formatter: () => number(total),
              },
              value: {
                fontSize: "20px",
                fontWeight: 800,
                color: "#1e293b",
                formatter: (val) => number(val),
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      legend: {
        position: "bottom",
        horizontalAlign: "center",
        fontSize: "12px",
        labels: { colors: "#334155" },
        markers: { radius: 12 },
      },
      tooltip: {
        y: {
          formatter: (val) => number(val) + " hồ sơ (" + percent(val, total) + ")",
        },
      },
    };

    try {
      const chart = new ApexCharts(chartWrap, options);
      chart.render();
      apexCharts[id] = chart;
    } catch (e) {
      fallbackBars(id, rows, total);
      return;
    }

    container.append(
      details(
        ["Nhóm", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
        rows.map((r) => [
          r.label,
          number(r.value),
          percent(r.value, total),
          r.installed == null ? "—" : number(r.installed),
        ]),
      ),
    );
  }

  // 4. Xếp hạng gói cước & Chi nhánh (Horizontal Ranked Bars)
  function rankedBarsApex(id, rows, total, barColor = "#f97316") {
    destroyChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.ApexCharts) {
      fallbackBars(id, rows, total);
      return;
    }

    if (!rows.length || !rows.some((r) => r.value > 0)) {
      container.append(
        adminNode("p", "Chưa có dữ liệu trong kỳ này.", "analytics-empty"),
      );
      container.append(
        details(
          ["Tên", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
          rows.map((r) => [
            r.label,
            number(r.value),
            percent(r.value, total),
            r.installed == null ? "—" : number(r.installed),
          ]),
        ),
      );
      return;
    }

    const sorted = [...rows].sort((a, b) => b.value - a.value).slice(0, 7);
    const chartWrap = adminNode("div", "", "apex-chart-container");
    container.append(chartWrap);

    const categories = sorted.map((r) => r.label);
    const values = sorted.map((r) => r.value);

    const options = {
      series: [{ name: "Hồ sơ", data: values }],
      chart: {
        type: "bar",
        height: 250,
        toolbar: { show: false },
        animations: { enabled: true, speed: 600 },
        fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
      },
      plotOptions: {
        bar: {
          borderRadius: 6,
          horizontal: true,
          barHeight: "50%",
          dataLabels: { position: "top" },
        },
      },
      colors: [barColor],
      dataLabels: {
        enabled: true,
        offsetX: 20,
        style: { fontSize: "11px", colors: ["#334155"], fontWeight: 700 },
        formatter: (val) => number(val),
      },
      xaxis: {
        categories: categories,
        labels: {
          style: { fontSize: "11px", colors: "#64748b" },
          formatter: (v) => number(v),
        },
      },
      yaxis: {
        labels: {
          style: { fontSize: "12px", colors: "#1e293b", fontWeight: 600 },
          maxWidth: 160,
        },
      },
      tooltip: {
        y: {
          formatter: (val) => number(val) + " hồ sơ (" + percent(val, total) + ")",
        },
      },
      grid: {
        borderColor: "rgba(226, 232, 240, 0.6)",
        strokeDashArray: 4,
      },
    };

    try {
      const chart = new ApexCharts(chartWrap, options);
      chart.render();
      apexCharts[id] = chart;
    } catch (e) {
      fallbackBars(id, rows, total);
      return;
    }

    container.append(
      details(
        ["Tên", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
        rows.map((r) => [
          r.label,
          number(r.value),
          percent(r.value, total),
          r.installed == null ? "—" : number(r.installed),
        ]),
      ),
    );
  }

  // 5. Cam kết dịch vụ SLA (Radial Gauge & Counters)
  function slaApex(t) {
    destroyChart("analytics-sla");
    const container = $("analytics-sla");
    container.replaceChildren();

    const awaiting = t.awaiting || 0;
    const overdue = t.overdue || 0;
    const onTimeCount = Math.max(0, awaiting - overdue);
    const onTimePct = awaiting > 0 ? Math.round((onTimeCount / awaiting) * 100) : 100;

    const wrap = adminNode("div", "", "sla-dashboard-layout");

    // Khối biểu đồ tròn Radial Gauge
    if (window.ApexCharts) {
      const chartWrap = adminNode("div", "", "sla-gauge-wrap");
      wrap.append(chartWrap);

      const gaugeColor = onTimePct >= 80 ? "#10b981" : onTimePct >= 60 ? "#f59e0b" : "#ef4444";

      const options = {
        series: [onTimePct],
        chart: {
          height: 190,
          type: "radialBar",
          animations: { enabled: true, speed: 700 },
          fontFamily: "'Be Vietnam Pro', -apple-system, sans-serif",
        },
        plotOptions: {
          radialBar: {
            startAngle: -135,
            endAngle: 135,
            hollow: { size: "65%" },
            track: {
              background: "#f1f5f9",
              strokeWidth: "100%",
            },
            dataLabels: {
              name: {
                show: true,
                fontSize: "11px",
                color: "#64748b",
                offsetY: -8,
              },
              value: {
                offsetY: 4,
                fontSize: "22px",
                fontWeight: 800,
                color: gaugeColor,
                formatter: (val) => val + "%",
              },
            },
          },
        },
        fill: {
          type: "solid",
          colors: [gaugeColor],
        },
        stroke: { dashArray: 3 },
        labels: ["ĐÚNG HẠN"],
      };

      try {
        const chart = new ApexCharts(chartWrap, options);
        chart.render();
        apexCharts["analytics-sla"] = chart;
      } catch (e) {
        console.warn("SLA gauge failed:", e);
      }
    }

    // Khối thống kê số lượng
    const statBlock = adminNode("div", "", "analytics-sla-stats");
    for (const [label, value, isAlert] of [
      ["Đang chờ phản hồi", awaiting, false],
      ["Đã quá hạn gọi lại", overdue, overdue > 0],
    ]) {
      const item = adminNode("div", "", isAlert ? "sla-stat-item alert" : "sla-stat-item");
      item.append(
        adminNode("div", number(value), "analytics-stat"),
        adminNode("p", label),
      );
      statBlock.append(item);
    }

    wrap.append(statBlock);
    container.append(wrap);

    const note = adminNode(
      "p",
      percent(overdue, awaiting) + " hồ sơ đang chờ hiện đã vượt quá hạn SLA.",
      "analytics-sla-note" + (overdue > 0 ? " text-danger" : " text-success"),
    );
    container.append(note);
  }

  /* ===================================================================
     RENDER KHUNG CHỈ SỐ KINH DOANH CHÍNH (KPI METRIC CARDS)
     =================================================================== */
  function render(data, campaigns) {
    const t = data.totals;
    $("analytics-kpis").replaceChildren();

    const kpiLinks = {
      "Hồ sơ tiếp nhận": "/admin/leads",
      "Đã liên hệ": "/admin/leads?status=contacting",
      "Đủ điều kiện": "/admin/leads?status=qualified",
      "Đã lắp đặt": "/admin/leads?status=installed",
    };

    const kpiMeta = [
      {
        label: "Hồ sơ tiếp nhận",
        value: number(t.leads),
        sub: "100% trong kỳ đã chọn",
        tone: "blue",
        icon: "📥",
        badgeClass: "badge-neutral",
      },
      {
        label: "Đã liên hệ",
        value: number(t.contacted),
        sub: percent(t.contacted, t.leads) + " trên tổng hồ sơ",
        tone: "purple",
        icon: "📞",
        badgeClass: "badge-purple",
      },
      {
        label: "Đủ điều kiện",
        value: number(t.qualified),
        sub: percent(t.qualified, t.leads) + " đủ điều kiện mạng",
        tone: "amber",
        icon: "⚡",
        badgeClass: "badge-amber",
      },
      {
        label: "Đã lắp đặt",
        value: number(t.installed),
        sub: percent(t.installed, t.leads) + " hợp đồng thành công",
        tone: "emerald",
        icon: "🚀",
        badgeClass: "badge-emerald",
      },
    ];

    for (const item of kpiMeta) {
      const card = adminNode("div", "", `kpi-card kpi-tone-${item.tone}`);
      const targetUrl = kpiLinks[item.label];

      if (targetUrl) {
        card.setAttribute("role", "link");
        card.setAttribute("tabindex", "0");
        card.setAttribute("title", "Bấm để mở danh sách hồ sơ: " + item.label);
        card.onclick = () => { window.location.href = targetUrl; };
        card.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            window.location.href = targetUrl;
          }
        };
      }

      // Header của card
      const top = adminNode("div", "", "kpi-top");
      const iconWrap = adminNode("div", item.icon, `kpi-icon-badge kpi-bg-${item.tone}`);
      const titleGroup = adminNode("div", "", "kpi-header-group");
      titleGroup.append(
        adminNode("div", item.label, "kpi-label"),
        adminNode("span", "Xem danh sách ➔", "kpi-action-hint"),
      );
      top.append(iconWrap, titleGroup);

      // Body của card
      const body = adminNode("div", "", "kpi-body");
      body.append(
        adminNode("div", item.value, "kpi-value"),
        adminNode("div", item.sub, `kpi-sub ${item.badgeClass}`),
      );

      card.append(top, body);
      $("analytics-kpis").append(card);
    }

    // Render các biểu đồ hiện đại
    trendApex(data.daily);

    funnelApex(
      "analytics-funnel",
      [
        { label: "Tiếp nhận", value: t.leads },
        { label: "Đã liên hệ", value: t.contacted },
        { label: "Đủ điều kiện", value: t.qualified },
        { label: "Đã lắp đặt", value: t.installed },
      ],
      t.leads,
    );

    donutApex(
      "analytics-sources",
      data.sources.map((r) => ({
        ...r,
        label: r.label === "unattributed" ? "Chưa ghi nhận nguồn" : r.label,
      })),
      t.leads,
      "Tổng nguồn",
    );

    donutApex(
      "analytics-statuses",
      data.statuses.map((r) => ({ ...r, label: adminStatusLabel(r.label) })),
      t.leads,
      "Tổng hồ sơ",
    );

    rankedBarsApex("analytics-plans", data.plans, t.leads, "#f97316");
    rankedBarsApex("analytics-branches", data.branches, t.leads, "#0ea5e9");

    slaApex(t);

    // Bảng hiệu quả chiến dịch & chi phí
    $("analytics-campaigns").replaceChildren();
    if (!campaigns.items || !campaigns.items.length) {
      $("analytics-campaigns").append(
        adminNode(
          "p",
          "Chưa có dữ liệu chiến dịch hoặc chi phí marketing được ghi nhận trong kỳ.",
          "analytics-empty",
        ),
      );
    } else {
      $("analytics-campaigns").append(
        table(
          [
            "Chiến dịch Marketing",
            "Số hồ sơ",
            "Đủ điều kiện",
            "Lắp đặt",
            "Tổng chi phí",
            "CPL (Chi phí / Lead)",
            "Chi phí / Lắp đặt",
          ],
          campaigns.items.map((r) => [
            r.campaign === "unattributed"
              ? "Chưa ghi nhận campaign"
              : r.campaign,
            number(r.leads),
            number(r.qualified),
            number(r.installed),
            adminMoney(r.cost_vnd),
            adminMoney(r.cpl_vnd),
            adminMoney(r.cost_per_installed_vnd),
          ]),
        ),
      );
    }

    $("analytics-asof").textContent =
      "Cập nhật " +
      new Date(data.as_of).toLocaleTimeString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      });

    $("analytics-state").textContent =
      `Đã tải kỳ ${data.start} – ${data.end} · ${number(t.leads)} hồ sơ · ${data.timezone}`;
  }

  /* ===================================================================
     DATA FETCHING & FILTER CONTROLLER
     =================================================================== */
  async function load() {
    const current = ++sequence,
      button = $("analytics-filter").querySelector("button");
    if (button) button.disabled = true;
    $("analytics-state").textContent = "Đang tổng hợp dữ liệu báo cáo kinh doanh…";
    $("analytics-state").classList.remove("analytics-error");

    try {
      const start = $("analytics-start").value,
        end = $("analytics-end").value;
      if (start > end || (Date.parse(end) - Date.parse(start)) / 86400000 > 92)
        throw new Error(
          "Chọn thời gian tối đa 93 ngày, ngày bắt đầu trước ngày kết thúc.",
        );

      const params = new URLSearchParams({ start, end });
      for (const [key, id] of [
        ["branch_id", "analytics-branch"],
        ["campaign", "analytics-campaign"],
      ]) {
        const value = $(id).value.trim();
        if (value) params.set(key, value);
      }

      const paths = ["analytics", "summary"];
      const results = await Promise.all(
        paths.map(async (path) => {
          const response = await adminFetch(
            "/api/v1/admin/reports/" + path + "?" + params,
          );
          if (!response.ok)
            throw new Error(
              "Không thể tải báo cáo. Kiểm tra quyền và kết nối rồi thử lại.",
            );
          return response.json();
        }),
      );

      if (current === sequence) render(...results);
    } catch (error) {
      if (current === sequence) {
        trendRows = null;
        destroyAllCharts();
        $("analytics-state").textContent = error.message;
        $("analytics-state").classList.add("analytics-error");
        $("analytics-asof").textContent = "Chưa cập nhật";
        $("analytics-kpis").replaceChildren();
        for (const id of [
          "trend",
          "funnel",
          "sla",
          "sources",
          "statuses",
          "plans",
          "branches",
          "campaigns",
        ]) {
          $("analytics-" + id).replaceChildren();
        }
      }
    } finally {
      if (current === sequence && button) button.disabled = false;
    }
  }

  function period(days) {
    const end = adminVietnamDay(),
      start = new Date(end + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - Number(days) + 1);
    $("analytics-start").value = start.toISOString().slice(0, 10);
    $("analytics-end").value = end;
  }

  $("analytics-filter").onsubmit = (e) => {
    e.preventDefault();
    load();
  };

  $("analytics-period").onchange = () => {
    period($("analytics-period").value);
    load();
  };

  period(30);

  adminFetch("/api/v1/admin/reports/branches")
    .then(async (response) => {
      if (!response.ok) return;
      const data = await response.json();
      for (const b of data.items) {
        if (b.id === "00000000-0000-0000-0000-000000000000") continue;
        const option = document.createElement("option");
        option.value = b.id;
        option.textContent = b.name;
        $("analytics-branch").append(option);
      }
    })
    .catch(() => {});

  load();

  document.addEventListener("admin:data-changed", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 600);
  });

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (trendRows && !window.ApexCharts) fallbackTrend(trendRows);
    }, 100);
  });
})();
