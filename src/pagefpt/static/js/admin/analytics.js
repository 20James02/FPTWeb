/**
 * PAGEFPT ENTERPRISE ADMIN ANALYTICS & SAAS DASHBOARD
 * Powered by Apache ECharts & Modern Responsive Metric Components
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
    trendRows = null,
    currentTrendData = null,
    currentSourcesData = null,
    currentSourcesTotal = 0,
    sourcesChartStyle = "rose";

  // Cache instance ECharts
  const echartsInstances = {};

  function disposeChart(id) {
    if (echartsInstances[id]) {
      try {
        echartsInstances[id].dispose();
      } catch (e) {
        /* ignore */
      }
      echartsInstances[id] = null;
    }
  }

  function disposeAllCharts() {
    for (const key of Object.keys(echartsInstances)) {
      disposeChart(key);
    }
  }

  function resizeAllCharts() {
    for (const key of Object.keys(echartsInstances)) {
      const inst = echartsInstances[key];
      if (inst && typeof inst.resize === "function") {
        try {
          inst.resize();
        } catch (e) {
          /* ignore */
        }
      }
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
     FALLBACK BARS & SVG (Dùng khi ECharts chưa tải hoặc môi trường test)
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
     HỆ THỐNG BIỂU ĐỒ APACHE ECHARTS CAO CẤP
     =================================================================== */

  // 1. Xu hướng tiếp nhận (ECharts Smooth Area Gradient)
  function trendECharts(rows) {
    trendRows = rows;
    currentTrendData = rows;
    disposeChart("analytics-trend");
    const container = $("analytics-trend");
    container.replaceChildren();

    if (!window.echarts) {
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

    const chartWrap = adminNode("div", "", "echart-canvas-wrap");
    container.append(chartWrap);

    try {
      const myChart = echarts.init(chartWrap);
      echartsInstances["analytics-trend"] = myChart;

      const option = {
        color: ["#2563eb", "#8b5cf6", "#10b981"],
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "#334155",
          borderWidth: 1,
          textStyle: { color: "#f8fafc", fontSize: 13 },
          axisPointer: {
            type: "cross",
            lineStyle: { color: "#94a3b8", width: 1, type: "dashed" },
          },
          formatter: function (params) {
            let res = `<div style="font-weight:700;margin-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:4px;">📅 ${params[0].name}</div>`;
            for (const item of params) {
              res += `<div style="display:flex;align-items:center;justify-content:space-between;gap:18px;margin:3px 0;">
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};"></span>
                  ${item.seriesName}
                </span>
                <b style="font-size:14px;color:#fff;">${number(item.value)}</b>
              </div>`;
            }
            return res;
          },
        },
        legend: {
          data: ["Tiếp nhận", "Đủ điều kiện", "Đã lắp đặt"],
          top: 8,
          right: 20,
          textStyle: { color: "#334155", fontWeight: 600 },
        },
        toolbox: {
          show: true,
          right: "center",
          top: 6,
          itemSize: 14,
          feature: {
            magicType: {
              type: ["line", "bar", "stack"],
              title: { line: "Đường", bar: "Cột", stack: "Xếp chồng" },
            },
            restore: { title: "Đặt lại" },
            saveAsImage: { title: "Lưu ảnh PNG", pixelRatio: 2 },
          },
        },
        grid: {
          left: "3%",
          right: "4%",
          bottom: rows.length > 14 ? "18%" : "10%",
          top: "16%",
          containLabel: true,
        },
        xAxis: {
          type: "category",
          boundaryGap: false,
          data: categories,
          axisLine: { lineStyle: { color: "#cbd5e1" } },
          axisLabel: {
            color: "#64748b",
            fontSize: 11,
            rotate: rows.length > 15 ? 25 : 0,
          },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "rgba(226, 232, 240, 0.7)", type: "dashed" } },
          axisLabel: { color: "#64748b", fontSize: 11, formatter: (val) => number(val) },
        },
        dataZoom: [
          {
            type: "slider",
            show: rows.length > 12,
            bottom: 4,
            height: 16,
            borderColor: "transparent",
            backgroundColor: "#f1f5f9",
            fillerColor: "rgba(37, 99, 235, 0.18)",
            handleSize: "100%",
            showDetail: false,
          },
        ],
        series: [
          {
            name: "Tiếp nhận",
            type: "line",
            smooth: true,
            showSymbol: rows.length <= 20,
            symbolSize: 6,
            lineStyle: { width: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(37, 99, 235, 0.35)" },
                { offset: 1, color: "rgba(37, 99, 235, 0.02)" },
              ]),
            },
            data: rows.map((r) => r.leads || 0),
          },
          {
            name: "Đủ điều kiện",
            type: "line",
            smooth: true,
            showSymbol: rows.length <= 20,
            symbolSize: 6,
            lineStyle: { width: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(139, 92, 246, 0.35)" },
                { offset: 1, color: "rgba(139, 92, 246, 0.02)" },
              ]),
            },
            data: rows.map((r) => r.qualified || 0),
          },
          {
            name: "Đã lắp đặt",
            type: "line",
            smooth: true,
            showSymbol: rows.length <= 20,
            symbolSize: 6,
            lineStyle: { width: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(16, 185, 129, 0.35)" },
                { offset: 1, color: "rgba(16, 185, 129, 0.02)" },
              ]),
            },
            data: rows.map((r) => r.installed || 0),
          },
        ],
      };

      myChart.setOption(option);
    } catch (e) {
      console.warn("ECharts trend error, fallback:", e);
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

  // 2. Phễu chuyển đổi dịch vụ (ECharts Funnel Chart)
  function funnelECharts(id, items, total) {
    disposeChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.echarts) {
      fallbackBars(id, items, total);
      return;
    }

    const chartWrap = adminNode("div", "", "echart-canvas-wrap");
    container.append(chartWrap);

    try {
      const myChart = echarts.init(chartWrap);
      echartsInstances[id] = myChart;

      const funnelData = items.map((r, i) => ({
        name: r.label,
        value: r.value || 0,
        itemStyle: {
          color: ["#2563eb", "#7c3aed", "#f59e0b", "#10b981"][i % 4],
          borderColor: "#ffffff",
          borderWidth: 2,
          borderRadius: 6,
        },
      }));

      const option = {
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "#334155",
          textStyle: { color: "#fff", fontSize: 13 },
          formatter: function (params) {
            return `<b>${params.name}</b><br/>Số lượng: <b>${number(params.value)}</b><br/>Tỷ trọng / Tổng: <b>${percent(params.value, total)}</b>`;
          },
        },
        series: [
          {
            name: "Phễu chuyển đổi",
            type: "funnel",
            left: "10%",
            top: 20,
            bottom: 20,
            width: "80%",
            min: 0,
            max: Math.max(...items.map((r) => r.value), 1),
            minSize: "20%",
            maxSize: "100%",
            sort: "descending",
            gap: 6,
            label: {
              show: true,
              position: "inside",
              fontSize: 12,
              fontWeight: 700,
              color: "#ffffff",
              formatter: "{b}: {c}",
            },
            labelLine: { show: false },
            itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.08)" },
            emphasis: {
              label: { fontSize: 14, fontWeight: 800 },
              itemStyle: { shadowBlur: 14, shadowColor: "rgba(0,0,0,0.2)" },
            },
            data: funnelData,
          },
        ],
      };

      myChart.setOption(option);
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

  // 3. Cam kết dịch vụ SLA (ECharts Semi-Circular Progress Gauge)
  function slaECharts(t) {
    disposeChart("analytics-sla");
    const container = $("analytics-sla");
    container.replaceChildren();

    const awaiting = t.awaiting || 0;
    const overdue = t.overdue || 0;
    const onTimeCount = Math.max(0, awaiting - overdue);
    const onTimePct = awaiting > 0 ? Math.round((onTimeCount / awaiting) * 100) : 100;

    const wrap = adminNode("div", "", "sla-dashboard-layout");

    if (window.echarts) {
      const chartWrap = adminNode("div", "", "sla-gauge-wrap echart-canvas-wrap");
      wrap.append(chartWrap);

      try {
        const myChart = echarts.init(chartWrap);
        echartsInstances["analytics-sla"] = myChart;

        const gaugeColor = onTimePct >= 80 ? "#10b981" : onTimePct >= 60 ? "#f59e0b" : "#ef4444";

        const option = {
          series: [
            {
              type: "gauge",
              startAngle: 200,
              endAngle: -20,
              min: 0,
              max: 100,
              radius: "95%",
              center: ["50%", "65%"],
              progress: {
                show: true,
                width: 14,
                itemStyle: {
                  color: gaugeColor,
                  borderRadius: 8,
                },
              },
              pointer: { show: false },
              axisLine: {
                lineStyle: {
                  width: 14,
                  color: [[1, "#f1f5f9"]],
                },
              },
              axisTick: { show: false },
              splitLine: { show: false },
              axisLabel: { show: false },
              detail: {
                valueAnimation: true,
                offsetCenter: [0, "-8%"],
                fontSize: 26,
                fontWeight: 800,
                color: gaugeColor,
                formatter: "{value}%",
              },
              title: {
                offsetCenter: [0, "25%"],
                fontSize: 11,
                fontWeight: 700,
                color: "#64748b",
              },
              data: [{ value: onTimePct, name: "ĐÚNG HẠN" }],
            },
          ],
        };

        myChart.setOption(option);
      } catch (e) {
        console.warn("ECharts SLA gauge error:", e);
      }
    }

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

  // 4. Cơ cấu nguồn khách hàng (ECharts Nightingale Rose / Donut Chart)
  function sourcesECharts(id, rows, total, style = "rose") {
    currentSourcesData = rows;
    currentSourcesTotal = total;
    sourcesChartStyle = style;

    disposeChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.echarts) {
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

    const chartWrap = adminNode("div", "", "echart-canvas-wrap");
    container.append(chartWrap);

    try {
      const myChart = echarts.init(chartWrap);
      echartsInstances[id] = myChart;

      const pieData = visible.map((r, i) => ({
        name: r.label,
        value: r.value,
        itemStyle: {
          color: COLORS[i % COLORS.length],
          borderRadius: 6,
          borderColor: "#fff",
          borderWidth: 2,
        },
      }));

      const isRose = style === "rose";

      const option = {
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "#334155",
          textStyle: { color: "#fff", fontSize: 13 },
          formatter: "{b}<br/>Số hồ sơ: <b>{c}</b> ({d}%)",
        },
        legend: {
          orient: "horizontal",
          bottom: 4,
          left: "center",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 11, color: "#475569" },
        },
        series: [
          {
            name: "Nguồn khách hàng",
            type: "pie",
            radius: isRose ? [20, 85] : ["44%", "72%"],
            center: ["50%", "45%"],
            roseType: isRose ? "radius" : false,
            itemStyle: {
              borderRadius: isRose ? 6 : 8,
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: "{b}: {d}%",
              fontSize: 11,
              fontWeight: 600,
              color: "#334155",
            },
            data: pieData,
          },
        ],
      };

      myChart.setOption(option);
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

  // 5. Phân bổ trạng thái xử lý (ECharts Rounded Donut Chart)
  function statusesECharts(id, rows, total) {
    disposeChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.echarts) {
      fallbackBars(id, rows, total);
      return;
    }

    if (!rows.length || !rows.some((r) => r.value > 0)) {
      container.append(
        adminNode("p", "Chưa có dữ liệu trong kỳ này.", "analytics-empty"),
      );
      container.append(
        details(
          ["Trạng thái", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
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

    const chartWrap = adminNode("div", "", "echart-canvas-wrap");
    container.append(chartWrap);

    try {
      const myChart = echarts.init(chartWrap);
      echartsInstances[id] = myChart;

      const pieData = visible.map((r, i) => ({
        name: r.label,
        value: r.value,
        itemStyle: {
          color: COLORS[i % COLORS.length],
          borderRadius: 8,
          borderColor: "#fff",
          borderWidth: 2,
        },
      }));

      const option = {
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "#334155",
          textStyle: { color: "#fff", fontSize: 13 },
          formatter: "{b}<br/>Số hồ sơ: <b>{c}</b> ({d}%)",
        },
        legend: {
          orient: "horizontal",
          bottom: 4,
          left: "center",
          itemWidth: 10,
          itemHeight: 10,
          textStyle: { fontSize: 11, color: "#475569" },
        },
        series: [
          {
            name: "Trạng thái",
            type: "pie",
            radius: ["45%", "72%"],
            center: ["50%", "45%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 8,
              borderColor: "#fff",
              borderWidth: 2,
            },
            label: {
              show: false,
              position: "center",
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 16,
                fontWeight: 800,
                color: "#1e293b",
                formatter: "{b}\n{d}%",
              },
            },
            labelLine: { show: false },
            data: pieData,
          },
        ],
      };

      myChart.setOption(option);
    } catch (e) {
      fallbackBars(id, rows, total);
      return;
    }

    container.append(
      details(
        ["Trạng thái", "Số hồ sơ", "Tỷ trọng", "Đã lắp đặt"],
        rows.map((r) => [
          r.label,
          number(r.value),
          percent(r.value, total),
          r.installed == null ? "—" : number(r.installed),
        ]),
      ),
    );
  }

  // 6. Xếp hạng Gói cước & Chi nhánh (ECharts Horizontal Rounded Bars)
  function rankedBarsECharts(id, rows, total, gradientColors = ["#f26f21", "#ff8c42"]) {
    disposeChart(id);
    const container = $(id);
    container.replaceChildren();

    if (!window.echarts) {
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
    const chartWrap = adminNode("div", "", "echart-canvas-wrap");
    container.append(chartWrap);

    try {
      const myChart = echarts.init(chartWrap);
      echartsInstances[id] = myChart;

      const categories = sorted.map((r) => r.label).reverse();
      const values = sorted.map((r) => r.value).reverse();

      const option = {
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "#334155",
          axisPointer: { type: "shadow" },
          textStyle: { color: "#fff", fontSize: 13 },
          formatter: function (params) {
            const p = params[0];
            return `<b>${p.name}</b><br/>Số hồ sơ: <b>${number(p.value)}</b> (${percent(p.value, total)})`;
          },
        },
        grid: {
          left: "3%",
          right: "12%",
          top: "6%",
          bottom: "6%",
          containLabel: true,
        },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "rgba(226, 232, 240, 0.7)", type: "dashed" } },
          axisLabel: { color: "#64748b", fontSize: 11, formatter: (val) => number(val) },
        },
        yAxis: {
          type: "category",
          data: categories,
          axisLine: { lineStyle: { color: "#cbd5e1" } },
          axisLabel: { color: "#1e293b", fontWeight: 600, fontSize: 12 },
        },
        series: [
          {
            name: "Hồ sơ",
            type: "bar",
            barWidth: 16,
            itemStyle: {
              borderRadius: [0, 8, 8, 0],
              color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: gradientColors[0] },
                { offset: 1, color: gradientColors[1] },
              ]),
            },
            label: {
              show: true,
              position: "right",
              color: "#334155",
              fontWeight: 700,
              fontSize: 12,
              formatter: (params) => number(params.value),
            },
            data: values,
          },
        ],
      };

      myChart.setOption(option);
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

      const top = adminNode("div", "", "kpi-top");
      const iconWrap = adminNode("div", item.icon, `kpi-icon-badge kpi-bg-${item.tone}`);
      const titleGroup = adminNode("div", "", "kpi-header-group");
      titleGroup.append(
        adminNode("div", item.label, "kpi-label"),
        adminNode("span", "Xem danh sách ➔", "kpi-action-hint"),
      );
      top.append(iconWrap, titleGroup);

      const body = adminNode("div", "", "kpi-body");
      body.append(
        adminNode("div", item.value, "kpi-value"),
        adminNode("div", item.sub, `kpi-sub ${item.badgeClass}`),
      );

      card.append(top, body);
      $("analytics-kpis").append(card);
    }

    // Vẽ biểu đồ ECharts chất lượng cao
    trendECharts(data.daily);

    funnelECharts(
      "analytics-funnel",
      [
        { label: "Tiếp nhận", value: t.leads },
        { label: "Đã liên hệ", value: t.contacted },
        { label: "Đủ điều kiện", value: t.qualified },
        { label: "Đã lắp đặt", value: t.installed },
      ],
      t.leads,
    );

    sourcesECharts(
      "analytics-sources",
      data.sources.map((r) => ({
        ...r,
        label: r.label === "unattributed" ? "Chưa ghi nhận nguồn" : r.label,
      })),
      t.leads,
      sourcesChartStyle,
    );

    statusesECharts(
      "analytics-statuses",
      data.statuses.map((r) => ({ ...r, label: adminStatusLabel(r.label) })),
      t.leads,
    );

    rankedBarsECharts("analytics-plans", data.plans, t.leads, ["#f26f21", "#ff8c42"]);
    rankedBarsECharts("analytics-branches", data.branches, t.leads, ["#0ea5e9", "#38bdf8"]);

    slaECharts(t);

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
     BỘ LỌC HIỂN THỊ (DISPLAY VIEW & IN-CHART TOGGLES)
     =================================================================== */
  function initChartDisplayFilters() {
    // 1. Bộ lọc hiển thị nhóm biểu đồ (View Tab Filter)
    const filterContainer = $("analytics-chart-filters");
    if (filterContainer) {
      filterContainer.querySelectorAll(".btn-view-tab").forEach((btn) => {
        btn.onclick = () => {
          filterContainer.querySelectorAll(".btn-view-tab").forEach((b) => {
            b.classList.remove("active");
            b.setAttribute("aria-selected", "false");
          });
          btn.classList.add("active");
          btn.setAttribute("aria-selected", "true");

          const filterGroup = btn.getAttribute("data-chart-filter");
          const cards = document.querySelectorAll("#analytics-charts-grid .chart-card");

          cards.forEach((card) => {
            const cardGroup = card.getAttribute("data-chart-group");
            if (filterGroup === "all" || cardGroup === filterGroup) {
              card.style.display = "";
            } else {
              card.style.display = "none";
            }
          });

          // Resize lại canvas ECharts khi DOM layout thay đổi
          setTimeout(resizeAllCharts, 80);
        };
      });
    }

    // 2. Bộ lọc chuỗi dữ liệu xu hướng (Trend Metric Toggle)
    const trendToggle = $("trend-metric-toggle");
    if (trendToggle) {
      trendToggle.querySelectorAll(".btn-metric-toggle").forEach((btn) => {
        btn.onclick = () => {
          trendToggle.querySelectorAll(".btn-metric-toggle").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");

          const seriesType = btn.getAttribute("data-series");
          const trendChart = echartsInstances["analytics-trend"];
          if (trendChart) {
            if (seriesType === "all") {
              trendChart.dispatchAction({ type: "legendAllSelect" });
            } else {
              const seriesMap = {
                leads: "Tiếp nhận",
                qualified: "Đủ điều kiện",
                installed: "Đã lắp đặt",
              };
              const targetName = seriesMap[seriesType];
              ["Tiếp nhận", "Đủ điều kiện", "Đã lắp đặt"].forEach((name) => {
                if (name === targetName) {
                  trendChart.dispatchAction({ type: "legendSelect", name });
                } else {
                  trendChart.dispatchAction({ type: "legendUnSelect", name });
                }
              });
            }
          }
        };
      });
    }

    // 3. Bộ lọc kiểu hiển thị nguồn khách hàng (Rose vs Donut Toggle)
    const sourcesToggle = $("sources-type-toggle");
    if (sourcesToggle) {
      sourcesToggle.querySelectorAll(".btn-metric-toggle").forEach((btn) => {
        btn.onclick = () => {
          sourcesToggle.querySelectorAll(".btn-metric-toggle").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");

          const chartStyle = btn.getAttribute("data-chart-style");
          if (currentSourcesData) {
            sourcesECharts("analytics-sources", currentSourcesData, currentSourcesTotal, chartStyle);
          }
        };
      });
    }
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
        disposeAllCharts();
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

  initChartDisplayFilters();
  load();

  document.addEventListener("admin:data-changed", () => {
    clearTimeout(timer);
    timer = setTimeout(load, 600);
  });

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (trendRows && !window.echarts) fallbackTrend(trendRows);
      resizeAllCharts();
    }, 100);
  });
})();
