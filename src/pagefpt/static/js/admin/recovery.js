/** Six-digit Telegram code and MFA proof are consumed on final submit. */
let recoveryBusy = false;
let currentRecoveryChallenge = "";
function clearRecoveryCodeError() {
  document.getElementById("forgot-otp-code")?.setAttribute?.("aria-invalid", "false");
  const error = document.getElementById("recovery-code-error");
  if (error) { error.textContent = ""; error.hidden = true; }
}
function showRecoveryCodeError(message) {
  const input = document.getElementById("forgot-otp-code");
  input?.setAttribute?.("aria-invalid", "true");
  const error = document.getElementById("recovery-code-error");
  if (error) { error.textContent = message; error.hidden = false; }
  else showToast(message, "error");
  input?.focus?.();
}
function showRecoveryReference() {
  clearRecoveryCodeError();
  const help = document.getElementById("recovery-code-help");
  if (help)
    help.textContent =
      "Mã yêu cầu: " + currentRecoveryChallenge.slice(-8).toUpperCase() +
      ". Nhận mã 6 số từ bot Telegram đã thiết lập hoặc liên hệ quản trị viên. Mã có hiệu lực 5 phút; gửi lại sẽ vô hiệu mã cũ.";
}
async function handleForgotStep1(e) {
  if (e) e.preventDefault();
  if (recoveryBusy) return;
  const account = document.getElementById("forgot-account").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account)) {
    showToast("Vui lòng nhập email quản trị đã đăng ký.", "error");
    return;
  }
  recoveryBusy = true;
  const button = document.getElementById("btn-forgot-step1-submit");
  button.disabled = true;
  try {
    const result = await recoveryRequest("", { email: account });
    if (!result.accepted || !result.challenge_id)
      throw new Error("Chưa xác nhận yêu cầu khôi phục.");
    currentRecoveryChallenge = result.challenge_id;
    currentForgotAccount = account;
    document.getElementById("forgot-otp-code").value = "";
    showRecoveryReference();
    showToast(
      "Nếu email thuộc tài khoản đang hoạt động, mã 6 số sẽ gửi đến bot Telegram đã thiết lập. Liên hệ quản trị viên nếu cần nhận mã.",
      "info",
    );
    goToForgotStep(2);
  } catch (err) {
    showToast(err.message || "Chưa gửi được yêu cầu khôi phục.", "error");
  } finally {
    recoveryBusy = false;
    button.disabled = false;
  }
}
async function handleForgotStep2(e) {
  if (e) e.preventDefault();
  if (recoveryBusy) return;
  const input = document.getElementById("forgot-otp-code");
  const otp = input.value.trim();
  if (!/^[0-9]{6}$/.test(otp) || !currentRecoveryChallenge) {
    showRecoveryCodeError("Nhập đúng mã Telegram gồm 6 chữ số.");
    return;
  }
  const challenge = currentRecoveryChallenge;
  const account = currentForgotAccount;
  const generation = typeof loginModeGeneration === "undefined" ? 0 : loginModeGeneration;
  const current = () =>
    challenge === currentRecoveryChallenge && account === currentForgotAccount &&
    input.value.trim() === otp &&
    generation === (typeof loginModeGeneration === "undefined" ? 0 : loginModeGeneration);
  const button = document.getElementById("btn-forgot-step2-submit");
  const label = button?.querySelector?.("span");
  const oldLabel = label?.textContent;
  recoveryBusy = true;
  clearRecoveryCodeError();
  button.disabled = true;
  button.setAttribute?.("aria-busy", "true");
  if (label) label.textContent = "Đang xác minh mã…";
  try {
    const result = await recoveryRequest("/verify", {email: account, challenge_id: challenge, otp});
    if (!current()) return;
    if (result.verified !== true) throw new Error("Mã chưa được xác minh. Hãy kiểm tra và thử lại.");
    goToForgotStep(3);
  } catch (err) {
    if (current()) showRecoveryCodeError(err.message || "Chưa xác minh được mã. Vui lòng thử lại.");
  } finally {
    recoveryBusy = false;
    button.disabled = false;
    button.setAttribute?.("aria-busy", "false");
    if (label) label.textContent = oldLabel;
  }
}
async function handleForgotStep3(e) {
  if (e) e.preventDefault();
  if (recoveryBusy) return;
  const password = document.getElementById("new-password").value;
  if (
    password.length < 8 ||
    password !== document.getElementById("confirm-new-password").value
  ) {
    showToast(
      "Mật khẩu cần ít nhất 8 ký tự và hai lần nhập phải khớp.",
      "error",
    );
    return;
  }
  recoveryBusy = true;
  const button = document.getElementById("btn-forgot-step3-submit");
  button.disabled = true;
  try {
    const proof = document.getElementById("forgot-otp-code").value.trim();
    const result = await recoveryRequest("/reset", {
      email: currentForgotAccount,
      otp: proof,
      challenge_id: currentRecoveryChallenge,
      password,
      totp: document.getElementById("recovery-totp").value.trim(),
      totp_factor_id:
        document.getElementById("recovery-factor")?.value || undefined,
    });
    if (!result.changed) throw new Error("Chưa xác nhận đổi mật khẩu.");
    document.getElementById("login-email").value = currentForgotAccount;
    for (const id of [
      "new-password",
      "confirm-new-password",
      "forgot-otp-code",
      "recovery-totp",
      "login-password",
    ])
      document.getElementById(id).value = "";
    currentRecoveryChallenge = "";
    switchLoginMode("login");
    showToast("Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.", "success");
  } catch (err) {
    showToast(err.message || "Chưa xác nhận đổi mật khẩu.", "error");
  } finally {
    recoveryBusy = false;
    button.disabled = false;
  }
}
async function resendForgotOtp() {
  if (recoveryBusy) return;
  recoveryBusy = true;
  try {
    const result = await recoveryRequest("", { email: currentForgotAccount });
    if (!result.accepted || !result.challenge_id)
      throw new Error("Chưa xác nhận gửi mã mới.");
    currentRecoveryChallenge = result.challenge_id;
    document.getElementById("forgot-otp-code").value = "";
    showRecoveryReference();
    showToast(
      "Nếu email hợp lệ, mã mới sẽ gửi đến bot Telegram đã thiết lập. Dùng mã yêu cầu mới để nhận đúng mã 6 số. Mã cũ hết hiệu lực.",
      "info",
    );
    startForgotOtpCountdown();
  } catch (err) {
    showToast(err.message || "Chưa gửi được mã mới.", "error");
  } finally {
    recoveryBusy = false;
  }
}
document.getElementById("forgot-otp-code")?.addEventListener?.("input", clearRecoveryCodeError);
