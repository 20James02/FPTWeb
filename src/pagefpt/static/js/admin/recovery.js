/** Six-digit Telegram code and MFA proof are consumed on final submit. */
let recoveryBusy = false;
let currentRecoveryChallenge = "";
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
    showToast(
      "Nếu tài khoản đã liên kết Telegram, mã 6 số sẽ gửi vào chat riêng với bot. Mã có hiệu lực 5 phút.",
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
function handleForgotStep2(e) {
  if (e) e.preventDefault();
  const otp = document.getElementById("forgot-otp-code").value.trim();
  if (!/^[0-9]{6}$/.test(otp) || !currentRecoveryChallenge) {
    showToast("Nhập đúng mã Telegram gồm 6 chữ số.", "error");
    return;
  }
  goToForgotStep(3);
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
    showToast(
      "Mã 6 số mới sẽ được gửi vào chat riêng Telegram nếu tài khoản đã liên kết. Mã cũ hết hiệu lực.",
      "info",
    );
    startForgotOtpCountdown();
  } catch (err) {
    showToast(err.message || "Chưa gửi được mã mới.", "error");
  } finally {
    recoveryBusy = false;
  }
}
