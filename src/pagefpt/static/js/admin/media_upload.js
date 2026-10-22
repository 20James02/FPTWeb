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
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (data.code === "PERMISSION_DENIED")
        throw Error("Cần quyền chỉnh sửa nội dung để tải ảnh.");
      if (data.code === "STORAGE_UNCONFIGURED")
        throw Error("Máy chủ chưa cấu hình kho lưu trữ ảnh R2.");
      if (data.code === "MEDIA_DOMAIN_UNCONFIGURED")
        throw Error("Máy chủ chưa cấu hình tên miền CDN cho ảnh.");
      throw Error(data.message || data.code || "Chưa xử lý được ảnh; kiểm tra quyền/MFA và thử lại.");
    }
    return data;
  }

  const intent = await request("media/upload-intents", {
    filename: file.name,
    content_type: file.type,
    size_bytes: file.size,
  });

  // Try direct presigned PUT to R2 first
  let directUploaded = false;
  try {
    const uploaded = await fetch(intent.upload_url, {
      method: "PUT",
      headers: intent.headers,
      body: file,
      credentials: "omit",
      signal: AbortSignal.timeout(60000),
    });
    if (uploaded.ok) {
      directUploaded = true;
    }
  } catch (_) {
    // Direct PUT to R2 may fail due to CORS on localhost or preview domains
  }

  // If direct PUT failed (e.g. CORS on localhost or network block), fallback to server upload proxy
  if (!directUploaded) {
    const fallbackRes = await adminFetch("/api/v1/admin/media/" + intent.id + "/upload-file", {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!fallbackRes.ok) {
      const errData = await fallbackRes.json().catch(() => ({}));
      if (errData.code === "BODY_TOO_LARGE" || errData.code === "MEDIA_TOO_LARGE") {
        throw Error("Tệp ảnh quá lớn. Vui lòng chọn ảnh dưới 10 MB.");
      }
      throw Error(errData.message || errData.code || "Tải ảnh chưa thành công. Hãy thử lại.");
    }
  }

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
