/* Upload to the signed R2 intent, then finalize through server media validation. */
window.adminUploadImage = async function (file) {
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size < 1 ||
    file.size > 10 * 1024 * 1024
  )
    throw Error("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.");
  async function request(path, body) {
    const r = await adminFetch("/api/v1/admin/" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok)
      throw Error(
        data.code === "PERMISSION_DENIED"
          ? "Cần quyền chỉnh sửa nội dung để tải ảnh."
          : "Chưa xử lý được ảnh; kiểm tra quyền/MFA và thử lại.",
      );
    return data;
  }
  const intent = await request("media/upload-intents", {
    filename: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });
  const uploaded = await fetch(intent.upload_url, {
    method: "PUT",
    headers: intent.headers,
    body: file,
    credentials: "omit",
    signal: AbortSignal.timeout(60000),
  });
  if (!uploaded.ok) throw Error("Tải ảnh chưa thành công. Hãy thử lại.");
  const result = await request("media/" + intent.id + "/finalize", {});
  return {
    id: result.id,
    payload: {
      url: result.url,
      image_url: result.url,
      filename: file.name,
      state: "ready",
      width: result.width,
      height: result.height,
    },
  };
};
