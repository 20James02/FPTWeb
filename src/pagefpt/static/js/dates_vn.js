/* Human dd/mm/yyyy; per-input value remains ISO for existing API serializers. */
(() => {
  const pad = (n) => String(n).padStart(2, "0");
  function toISO(value, type = "date") {
    if (!value) return "";
    const text = String(value).trim();
    let m = text.match(
        /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
      ),
      iso;
    if (m)
      iso = `${m[3]}-${m[2]}-${m[1]}${type === "datetime-local" ? "T" + (m[4] || "00") + ":" + (m[5] || "00") + (m[6] ? ":" + m[6] : "") : ""}`;
    else iso = text;
    if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(iso)) return "";
    const [date, time] = iso.split("T"),
      [y, mo, d] = date.split("-").map(Number),
      [h = 0, mi = 0, sec = 0] = (time || "").split(":").map(Number),
      v = new Date(y, mo - 1, d, h, mi, sec);
    if (
      y < 1000 ||
      v.getFullYear() !== y ||
      v.getMonth() !== mo - 1 ||
      v.getDate() !== d ||
      h > 23 ||
      mi > 59 ||
      sec > 59
    )
      return "";
    return type === "date" ? date : time ? iso : date + "T00:00";
  }
  function toDisplay(value, type = "date") {
    const iso = toISO(value, type);
    if (!iso) return value || "";
    const [date, time] = iso.split("T"),
      [y, m, d] = date.split("-");
    return `${d}/${m}/${y}${type === "datetime-local" ? " " + (time || "00:00") : ""}`;
  }
  function format(value, withTime = true) {
    if (!value) return "—";
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return toDisplay(value);
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(withTime
          ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
          : {}),
      }).formatToParts(d),
      get = (t) => parts.find((p) => p.type === t)?.value;
    return `${get("day")}/${get("month")}/${get("year")}${withTime ? " " + get("hour") + ":" + get("minute") : ""}`;
  }
  function enhance(root = document) {
    for (const input of root.querySelectorAll(
      'input[type="date"],input[type="datetime-local"]',
    )) {
      if (input.dataset.dateEnhanced) continue;
      const type = input.type,
        descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ),
        initial = input.value,
        min = input.min,
        max = input.max;
      input.dataset.dateEnhanced = "true";
      input.dataset.dateType = type;
      input.type = "text";
      input.inputMode = "numeric";
      input.placeholder = type === "date" ? "dd/mm/yyyy" : "dd/mm/yyyy HH:mm";
      input.setAttribute(
        "aria-description",
        "Ngày/tháng/năm" + (type === "date" ? "" : " giờ:phút"),
      );
      input.removeAttribute("min");
      input.removeAttribute("max");
      Object.defineProperty(input, "value", {
        configurable: true,
        get() {
          return toISO(descriptor.get.call(input), type);
        },
        set(v) {
          descriptor.set.call(input, toDisplay(v, type));
          validate();
        },
      });
      function validate() {
        const raw = descriptor.get.call(input),
          v = toISO(raw, type);
        input.setCustomValidity(
          raw && (!v || (min && v < min) || (max && v > max))
            ? "Nhập ngày hợp lệ theo dd/mm/yyyy" +
                (type === "date" ? "" : " HH:mm")
            : "",
        );
      }
      input.value = initial;
      input.addEventListener("input", () => {
        const raw = descriptor.get.call(input);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw))
          descriptor.set.call(input, toDisplay(raw, type));
        validate();
      });
      input.addEventListener("blur", () => {
        if (input.value)
          descriptor.set.call(input, toDisplay(input.value, type));
        validate();
      });
      const button = document.createElement("button");
      button.type = "button";
      button.className = "date-picker-button";
      button.textContent = "▦";
      button.setAttribute("aria-label", "Chọn ngày trên lịch");
      const picker = document.createElement("input");
      picker.type = type;
      picker.tabIndex = -1;
      picker.dataset.dateEnhanced = "true";
      picker.setAttribute("aria-label", "Lịch chọn ngày");
      picker.className = "date-native-picker";
      if (min) picker.min = min;
      if (max) picker.max = max;
      picker.onchange = () => {
        input.value = picker.value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.focus();
      };
      button.onclick = () => {
        picker.value = input.value;
        if (typeof picker.showPicker === "function") {
          try {
            picker.showPicker();
          } catch (_) {
            picker.click();
          }
        } else picker.click();
      };
      const wrapper = document.createElement("span");
      wrapper.className = "date-input-wrapper";
      input.before(wrapper);
      wrapper.append(input, button, picker);
      button.disabled = input.disabled || input.readOnly;
      picker.disabled = button.disabled;
      input.form?.addEventListener("reset", () =>
        setTimeout(() => {
          descriptor.set.call(
            input,
            toDisplay(descriptor.get.call(input), type),
          );
          validate();
        }, 0),
      );
    }
  }
  window.PageFPTDates = { toISO, toDisplay, format, enhance };
  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    new MutationObserver((entries) => {
      for (const entry of entries)
        for (const node of entry.addedNodes)
          if (node.nodeType === 1) {
            if (node.matches("input[type=date],input[type=datetime-local]"))
              enhance(node.parentElement);
            else if (
              node.querySelector("input[type=date],input[type=datetime-local]")
            )
              enhance(node);
          }
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
