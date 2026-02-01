// services/meCache.js
const KEY = "ME_CACHE_V1";

function now() {
  return Date.now();
}

function getCache() {
  try {
    return wx.getStorageSync(KEY) || null;
  } catch (e) {
    return null;
  }
}

function setCache(me) {
  try {
    wx.setStorageSync(KEY, { me, fetchedAt: now() });
  } catch (e) {}
}

function clearCache() {
  try {
    wx.removeStorageSync(KEY);
  } catch (e) {}
}

function isFresh(cache, ttlMs) {
  if (!cache || !cache.fetchedAt) return false;
  return now() - cache.fetchedAt < ttlMs;
}

module.exports = { getCache, setCache, clearCache, isFresh };
