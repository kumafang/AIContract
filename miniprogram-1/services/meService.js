// services/meService.js
const { request } = require("./request");
const { getCache, setCache, clearCache, isFresh } = require("./meCache");
const { getToken } = require("./storage");

const DEFAULT_TTL = 30 * 1000; // 30 秒（非常合理）

/**
 * 获取当前用户信息（带 credits）
 * @param {Object} opts
 * @param {boolean} opts.force 是否强制刷新
 * @param {number} opts.ttl 缓存时间
 */
async function getMe(opts = {}) {
  const { force = false, ttl = DEFAULT_TTL } = opts;

  const token = getToken();
  if (!token) {
    clearCache();
    return { ok: false, reason: "unauth" };
  }

  const cache = getCache();
  if (!force && isFresh(cache, ttl)) {
    return {
      ok: true,
      me: cache.me,
      credits: Number(cache.me?.credits ?? 0),
      from: "cache",
    };
  }

  try {
    const me = await request({ url: "/v1/users/me", method: "GET" });
    setCache(me);
    return {
      ok: true,
      me,
      credits: Number(me?.credits ?? 0),
      from: "network",
    };
  } catch (e) {
    // 如果接口失败，但本地有 cache → 兜底用 cache
    if (cache?.me) {
      return {
        ok: true,
        me: cache.me,
        credits: Number(cache.me?.credits ?? 0),
        from: "stale-cache",
      };
    }

    clearCache();
    return { ok: false, reason: "network", err: e };
  }
}

module.exports = {
  getMe,
  clearMeCache: clearCache,
};
