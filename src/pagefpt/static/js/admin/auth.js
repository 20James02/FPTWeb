/** Opaque HttpOnly session; provider tokens and credentials never enter browser storage. */
let adminLeavingPage = false;
function redirectAdminLogin() {
  if (adminLeavingPage) return;
  adminLeavingPage = true;
  window.location.assign("/admin/login");
}
function adminCsrf() {
  const item = document.cookie
    .split("; ")
    .find((v) => v.startsWith("pagefpt_csrf="));
  return item ? decodeURIComponent(item.slice("pagefpt_csrf=".length)) : "";
}
async function adminFetch(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!["GET", "HEAD", "OPTIONS"].includes(method))
    headers.set("X-CSRF-Token", adminCsrf());
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (response.status === 401 && !window.location.pathname.includes("/login"))
    redirectAdminLogin();
  return response;
}
async function loginWithCredentials(email, password, otp = "") {
  try {
    const response = await fetch("/api/v1/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email, password, otp }),
    });
    const data = await response.json();
    if (response.ok) return { success: true };
    return {
      success: false,
      requiresMFA: data.code === "MFA_REQUIRED",
      message:
        data.code === "AUTH_UNCONFIGURED"
          ? "Máy chủ chưa được cấu hình xác thực."
          : "Không thể đăng nhập. Kiểm tra tài khoản và mã xác thực.",
    };
  } catch (_) {
    return {
      success: false,
      message: "Không thể kết nối máy chủ xác thực. Vui lòng thử lại.",
    };
  }
}
async function logoutAdmin() {
  try {
    const response = await adminFetch("/api/v1/auth/session", {
      method: "DELETE",
    });
    if (!response.ok)
      throw new Error("Đăng xuất chưa thành công. Vui lòng thử lại.");
    redirectAdminLogin();
  } catch (e) {
    if (typeof showToast === "function") showToast(e.message, "error");
  }
}

async function recoveryRequest(path, payload) {
  const response = await fetch("/api/v1/auth/recovery" + path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    const messages = {
      AUTH_UNCONFIGURED: "Chưa cấu hình khôi phục mật khẩu trên máy chủ.",
      AUTH_UNAVAILABLE:
        "Không thể xác nhận với máy chủ. Vui lòng yêu cầu mã mới và thử lại.",
      RATE_LIMITED: "Đã có nhiều yêu cầu. Vui lòng chờ trước khi thử lại.",
      MFA_REQUIRED:
        "Cần mã từ ứng dụng xác thực MFA. Hãy yêu cầu mã email mới và nhập cả hai mã.",
      PASSWORD_REJECTED:
        "Mật khẩu chưa đáp ứng chính sách. Hãy yêu cầu mã mới và chọn mật khẩu khác.",
    };
    throw new Error(
      messages[data.code] ||
        "Mã không hợp lệ, hết hạn hoặc tài khoản không được phép. Hãy yêu cầu mã mới.",
    );
  }
  return data;
}
document.addEventListener("DOMContentLoaded", async () => {
  localStorage.removeItem("pagefpt_admin_token");
  localStorage.removeItem("pagefpt_admin_user");
  if (window.location.pathname.includes("/login")) return;
  try {
    const response = await adminFetch("/api/v1/admin/me");
    if (!response.ok) return;
    const user = await response.json();
    const name = document.getElementById("admin-user-name");
    if (name)
      name.textContent =
        user.memberships.find((m) => m.display_name)?.display_name ||
        user.id.slice(0, 8);
    const role = document.getElementById("admin-user-role");
    if (role)
      role.textContent = user.aal === "aal2" ? "MFA đã xác thực" : "Phiên AAL1";
  } catch (_) {
    /* Keep shell visible; no pretend authentication. */
  }
});
