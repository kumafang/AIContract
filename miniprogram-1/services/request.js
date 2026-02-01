// services/request.js
const { BASE_URL } = require("./config");
const { getToken } = require("./storage");

function safeStringify(v) {
  try {
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

function extractErrMessage(body, statusCode) {
  if (!body) return `Request failed: ${statusCode}`;
  // FastAPI 常见：{"detail": "..."} 或 {"detail": {...}}
  if (body.detail !== undefined) {
    return typeof body.detail === "string" ? body.detail : safeStringify(body.detail);
  }
  if (body.message !== undefined) {
    return typeof body.message === "string" ? body.message : safeStringify(body.message);
  }
  return safeStringify(body);
}

function request({ url, method = "GET", data, header = {}, timeout = 150000 }) {
  const token = getToken();

  const path = (url && url.charAt(0) === "/") ? url : ("/" + (url || ""));
  const fullUrl = BASE_URL + path;

  console.log("[request] method =", method);
  console.log("[request] fullUrl =", fullUrl);
  console.log("[request] token exists =", !!token);

  return new Promise((resolve, reject) => {
    wx.request({
      url: fullUrl,
      method,
      data,
      timeout,
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...header,
      },

      success(res) {
        const statusCode = res.statusCode;
        const body = res.data;

        console.log("[request] response", {
          statusCode,
          fullUrl,
          body,
        });

        if (statusCode >= 200 && statusCode < 300) {
          resolve(body);
          return;
        }

        const msg = extractErrMessage(body, statusCode);
        const err = new Error(msg);
        err.statusCode = statusCode;
        err.response = body;
        reject(err);
      },

      fail(err) {
        console.error("[request] FAIL (network)", { fullUrl, err });
        reject({
          errMsg: err && err.errMsg,
          errno: err && err.errno,
          fullUrl,
        });
      },

      complete(res) {
        console.log("[request] complete", {
          fullUrl,
          errMsg: res && res.errMsg,
          statusCode: res && res.statusCode,
        });
      },
    });
  });
}

module.exports = { request };
