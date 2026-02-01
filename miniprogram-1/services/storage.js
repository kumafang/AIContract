// services/storage.js
const TOKEN_KEYS = ["access_token", "token", "accessToken"];

function getToken() {
  for (const k of TOKEN_KEYS) {
    const v = wx.getStorageSync(k);
    if (v) return v;
  }
  return "";
}

function setToken(token) {
  // 统一写到 access_token
  wx.setStorageSync("access_token", token);
  // 同时清掉旧 key，避免混乱
  wx.removeStorageSync("token");
  wx.removeStorageSync("accessToken");
}

function clearToken() {
  for (const k of TOKEN_KEYS) {
    wx.removeStorageSync(k);
  }
}

module.exports = {
  getToken,
  setToken,
  clearToken,
};
