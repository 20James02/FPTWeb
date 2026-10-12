/** Bounded, branch-scoped aggregate charts. Text and tables are always available. */
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$("analytics-dashboard")) return;
  const COLORS = ["#2563eb", "#7c3aed", "#059669", "#c2410c", "#0891b2"];
  let sequence = 0,
    timer,
    resizeTimer,
    trendRows = null;
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
    detail.append(
      adminNode("summary", "Xem bảng dữ liệu"),
      table(headers, rows),
    );
    return detail;
  }
  function bars(id, rows, total) {
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
  function svgNode(name, attributes = {}) {
    const item = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes))
      item.setAttribute(key, String(value));
    return item;
  }
  function trend(rows) {
    trendRows = rows;
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
      const ticks = width < 450 ? 2 : 4;
      const tickIndices = new Set(
        Array.from({ length: ticks + 1 }, (_, i) =>
          Math.round((i * (rows.length - 1)) / ticks),
        ),
      );
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
      rows.forEach((row, i) => {
        const dot = svgNode("circle", {
          cx: x(i),
          cy: y(row.leads),
          r: 4,
          fill: COLORS[0],
          tabindex: 0,
          role: "img",
          "aria-label": `${PageFPTDates.format(row.day, false)}: tiếp nhận ${row.leads}, đủ điều kiện ${row.qualified}, lắp đặt ${row.installed}`,
        });
        const title = svgNode("title");
        title.textContent = `${PageFPTDates.format(row.day, false)}: Tiếp nhận ${row.leads} · Đủ điều kiện ${row.qualified} · Lắp đặt ${row.installed}`;
        dot.append(title);
        svg.append(dot);
        if (tickIndices.has(i)) {
          const text = svgNode("text", {
            x: x(i),
            y: height - 12,
            "text-anchor":
              i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle",
          });
          text.textContent = PageFPTDates.format(row.day, false);
          svg.append(text);
        }
      });
      container.append(svg);
    } else
      container.append(
        adminNode(
          "p",
          "Chưa ghi nhận hồ sơ trong kỳ. Không có xu hướng để đánh giá.",
          "analytics-empty",
        ),
      );
    container.append(
      details(
        ["Ngày nhận", "Tiếp nhận", "Đã liên hệ", "Đủ điều kiện", "Đã lắp đặt"],
        rows.map((r) => [
          PageFPTDates.format(r.day, false),
          number(r.leads),
          number(r.contacted),
          number(r.qualified),
          number(r.installed),
        ]),
      ),
    );
  }
  function render(data, campaigns) {
    const t = data.totals;
    $("analytics-kpis").replaceChildren();
    for (const [label, value, sub] of [
      ["Hồ sơ tiếp nhận", number(t.leads), "Trong kỳ đã chọn"],
      [
        "Đã liên hệ",
        number(t.contacted),
        percent(t.contacted, t.leads) + " trên tổng hồ sơ",
      ],
      [
        "Đủ điều kiện",
        number(t.qualified),
        percent(t.qualified, t.leads) + " trên tổng hồ sơ",
      ],
      [
        "Đã lắp đặt",
        number(t.installed),
        percent(t.installed, t.leads) + " trên tổng hồ sơ",
      ],
    ]) {
      const card = adminNode("div", "", "kpi-card");
      card.append(
        adminNode("div", label, "kpi-label"),
        adminNode("div", value, "kpi-value"),
        adminNode("div", sub, "kpi-sub"),
      );
      $("analytics-kpis").append(card);
    }
    trend(data.daily);
    bars(
      "analytics-funnel",
      [
        { label: "Tiếp nhận", value: t.leads },
        { label: "Đã liên hệ", value: t.contacted },
        { label: "Đủ điều kiện", value: t.qualified },
        { label: "Đã lắp đặt", value: t.installed },
      ],
      t.leads,
    );
    bars(
      "analytics-sources",
      data.sources.map((r) => ({
        ...r,
        label: r.label === "unattributed" ? "Chưa ghi nhận nguồn" : r.label,
      })),
      t.leads,
    );
    bars(
      "analytics-statuses",
      data.statuses.map((r) => ({ ...r, label: adminStatusLabel(r.label) })),
      t.leads,
    );
    bars("analytics-plans", data.plans, t.leads);
    bars("analytics-branches", data.branches, t.leads);
    $("analytics-sla").replaceChildren();
    const sla = adminNode("div", "", "analytics-sla");
    for (const [label, value] of [
      ["Đang chờ phản hồi", t.awaiting],
      ["Đã quá hạn", t.overdue],
    ]) {
      const item = adminNode("div");
      item.append(
        adminNode("div", number(value), "analytics-stat"),
        adminNode("p", label),
      );
      sla.append(item);
    }
    $("analytics-sla").append(
      sla,
      adminNode(
        "p",
        percent(t.overdue, t.awaiting) + " hồ sơ đang chờ đã quá hạn",
      ),
    );
    $("analytics-campaigns").replaceChildren();
    if (!campaigns.items.length)
      $("analytics-campaigns").append(
        adminNode(
          "p",
          "Chưa có chiến dịch hoặc chi phí trong kỳ.",
          "analytics-empty",
        ),
      );
    else
      $("analytics-campaigns").append(
        table(
          [
            "Chiến dịch",
            "Hồ sơ",
            "Đủ điều kiện",
            "Lắp đặt",
            "Chi phí đã nhập",
            "CPL",
            "Chi phí / lắp đặt",
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
    $("analytics-asof").textContent =
      "Cập nhật " +
      new Date(data.as_of).toLocaleTimeString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
      });
    $("analytics-state").textContent =
      `Đã tải kỳ ${data.start} – ${data.end} · ${number(t.leads)} hồ sơ · ${data.timezone}`;
  }
  async function load() {
    const current = ++sequence,
      button = $("analytics-filter").querySelector("button");
    button.disabled = true;
    $("analytics-state").textContent = "Đang tổng hợp dữ liệu…";
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
        ])
          $("analytics-" + id).replaceChildren();
      }
    } finally {
      if (current === sequence) button.disabled = false;
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
      if (trendRows) trend(trendRows);
    }, 100);
  });
})();
