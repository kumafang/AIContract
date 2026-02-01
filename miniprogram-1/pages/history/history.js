// pages/history/history.js
const { request } = require("../../services/request");
const { getToken } = require("../../services/storage");

/** ========= Cache (localStorage) ========= */
const HISTORY_CACHE_KEY = "HISTORY_CACHE_V1";
const HISTORY_TTL = 60 * 1000; // 60s，你想更省请求就改 120s/300s

function getHistoryCache() {
  try {
    return wx.getStorageSync(HISTORY_CACHE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setHistoryCache(payload) {
  try {
    wx.setStorageSync(HISTORY_CACHE_KEY, payload);
  } catch (e) {}
}

function clearHistoryCache() {
  try {
    wx.removeStorageSync(HISTORY_CACHE_KEY);
  } catch (e) {}
}

function isHistoryFresh(cache, ttlMs) {
  if (!cache || !cache.at) return false;
  return Date.now() - Number(cache.at) < ttlMs;
}

/** ========= Your existing helpers ========= */
const CONTRACT_TYPE_CN = {
  general: "通用合同",
  marriage: "婚姻财产",
  house_sale: "房屋买卖",
  vehicle_sale: "车辆买卖",
  lease: "租赁相关",
  employment: "劳动合同",
  nda: "保密协议",
  service: "采购服务",
};

function toDateText(iso) {
  const s = String(iso || "");
  return s ? s.slice(0, 10) : "";
}

function clampScore(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

function scoreToRisk(score) {
  const s = clampScore(score);
  if (s < 40) return { riskText: "高风险", riskClass: "risk-high" };
  if (s < 70) return { riskText: "中风险", riskClass: "risk-medium" };
  return { riskText: "低风险", riskClass: "risk-low" };
}

function pad2(n) {
  const x = Number(n) || 0;
  return x < 10 ? "0" + x : String(x);
}

function identityText(identity) {
  const v = String(identity || "").toUpperCase();
  if (v === "A") return "甲方";
  if (v === "B") return "乙方";
  return v || "—";
}

/** 生成与 share 一致的 display name：通用合同-01 / 通用合同-02 ... */
function applyDisplayNames(serverItems) {
  const items = (serverItems || []).map((x) => ({ ...x }));
  const groups = {};

  for (const it of items) {
    const t = String(it.type || "general");
    if (!groups[t]) groups[t] = [];
    groups[t].push(it);
  }

  for (const t in groups) {
    groups[t].sort((a, b) => {
      const da = String(a.date || "");
      const db = String(b.date || "");
      if (da < db) return -1;
      if (da > db) return 1;
      return String(a.id || "") < String(b.id || "") ? -1 : 1;
    });

    const base = CONTRACT_TYPE_CN[t] || "合同";
    for (let i = 0; i < groups[t].length; i++) {
      groups[t][i]._displayName = `${base}-${pad2(i + 1)}`;
    }
  }

  return items;
}

function makeSnippetPreview(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return "（无合同原文）";
  return raw.length > 28 ? raw.slice(0, 28) + "…" : raw;
}

function makeSnippetText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "（无合同原文）";
  const MAX = 600;
  return raw.length > MAX ? raw.slice(0, MAX) + "\n…（已截断）" : raw;
}

function normalizeItem(item) {
  const result = item.result || {};
  const score = clampScore(result.score);
  const risk = scoreToRisk(score);
  const displayName = item._displayName || "合同";

  const original = result.originalContent || "";
  return {
    id: String(item.id),
    type: String(item.type || ""),
    identity: String(item.identity || ""),
    identityText: identityText(item.identity),

    name: displayName,
    date: String(item.date || ""),
    dateText: toDateText(item.date),

    score,
    riskText: risk.riskText,
    riskClass: risk.riskClass,

    riskSummary: result.riskSummary || "",
    originalContent: original,
    clauses: Array.isArray(result.clauses) ? result.clauses : [],
    fileUrl: item.fileUrl || null,
    promptVersion: item.promptVersion || "",

    snippetPreview: makeSnippetPreview(original),
  };
}

// ✅ 统一：把服务端 items -> 页面 items（并按时间倒序）
function mapServerToViewItems(raw) {
  const withNames = applyDisplayNames(raw);
  const mapped = withNames.map(normalizeItem);

  mapped.sort((a, b) => {
    const da = String(a.date || "");
    const db = String(b.date || "");
    if (da > db) return -1;
    if (da < db) return 1;
    return String(a.id) > String(b.id) ? -1 : 1;
  });

  return mapped;
}

Page({
  data: {
    loading: false,
    error: "",
    items: [],
    deletingId: "",

    // snippet modal
    snippetOpen: false,
    snippetTitle: "",
    snippetMeta: "",
    snippetText: "",
  },

  onShow() {
    // 1) 秒开：先渲染缓存
    const cache = getHistoryCache();
    if (cache && Array.isArray(cache.items)) {
      this.setData({ items: cache.items, error: "" });
    }

    // 2) 未登录不请求
    const token = getToken();
    if (!token) {
      // 有缓存就继续显示缓存；没有就提示
      if (!cache || !Array.isArray(cache.items) || !cache.items.length) {
        this.setData({ error: "请先登录", items: [] });
      }
      return;
    }

    // 3) 缓存新鲜就不请求
    if (isHistoryFresh(cache, HISTORY_TTL)) return;

    // 4) 缓存过期才刷新
    this.loadHistory({ force: false });
  },

  async loadHistory({ force } = { force: false }) {
    const token = getToken();
    if (!token) {
      this.setData({ loading: false, error: "请先登录", items: [] });
      return;
    }

    // force=false 且缓存仍新鲜：直接用缓存
    const cache = getHistoryCache();
    if (!force && isHistoryFresh(cache, HISTORY_TTL) && Array.isArray(cache.items)) {
      this.setData({ items: cache.items, loading: false, error: "" });
      return;
    }

    this.setData({ loading: true, error: "" });

    try {
      const data = await request({ url: "/v1/contracts/history", method: "GET" });
      const raw = Array.isArray(data.items) ? data.items : [];
      const viewItems = mapServerToViewItems(raw);

      // ✅ 更新页面
      this.setData({ items: viewItems, loading: false, error: "" });

      // ✅ 写缓存
      setHistoryCache({
        at: Date.now(),
        items: viewItems,
      });
    } catch (err) {
      console.error("[history] loadHistory fail:", err);

      // 若有缓存，就保留缓存不清空，避免“闪空”
      const c = getHistoryCache();
      const hasCache = c && Array.isArray(c.items) && c.items.length;

      this.setData({
        loading: false,
        error: (err && (err.message || err.errMsg)) || "拉取失败",
        items: hasCache ? c.items : [],
      });
    }
  },

  // 顶部刷新按钮（如果你有），也走 force
  refresh() {
    this.loadHistory({ force: true });
  },

  onBack() {
    wx.navigateBack();
  },

  noop() {},

  openReport(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) ? e.currentTarget.dataset : {};
    const id = String(ds.id || "");
    if (!id) return;

    const list = this.data.items || [];
    const hit = list.find((x) => String(x.id) === id);
    if (!hit) {
      wx.showToast({ title: "记录不存在或已删除", icon: "none" });
      return;
    }

    wx.setStorageSync("ANALYSIS_RESULT", {
      id: hit.id,
      name: hit.name,
      date: hit.date,
      score: hit.score,
      riskSummary: hit.riskSummary,
      originalContent: hit.originalContent,
      clauses: hit.clauses,
      fileUrl: hit.fileUrl,
      type: hit.type,
      identity: hit.identity,
      promptVersion: hit.promptVersion,
      status: "completed",
    });

    wx.navigateTo({ url: "/pages/report/report" });
  },

  openSnippet(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) ? e.currentTarget.dataset : {};
    const id = String(ds.id || "");
    if (!id) return;

    const hit = (this.data.items || []).find((x) => String(x.id) === id);
    if (!hit) return;

    const meta = `${hit.dateText}${hit.identityText ? " · " + hit.identityText : ""}`;

    this.setData({
      snippetOpen: true,
      snippetTitle: hit.name,
      snippetMeta: meta,
      snippetText: makeSnippetText(hit.originalContent),
    });
  },

  closeSnippet() {
    this.setData({ snippetOpen: false, snippetTitle: "", snippetMeta: "", snippetText: "" });
  },

  /** ✅ 右上角 ... 菜单 */
  openMore(e) {
    const ds = (e && e.currentTarget && e.currentTarget.dataset) ? e.currentTarget.dataset : {};
    const id = String(ds.id || "");
    const name = String(ds.name || "这条记录");
    if (!id) return;

    wx.showActionSheet({
      itemList: ["删除记录"],
      itemColor: "#ff6b6b",
      success: (res) => {
        if (res.tapIndex === 0) {
          this._confirmAndDelete(id, name);
        }
      },
      fail: () => {},
    });
  },

  async _confirmAndDelete(id, name) {
    if (!id) return;
    if (this.data.deletingId) return;

    const ok = await new Promise((resolve) => {
      wx.showModal({
        title: "确认删除？",
        content: `将删除：${name}\n（不可撤销）`,
        confirmText: "删除",
        confirmColor: "#ff6b6b",
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false),
      });
    });
    if (!ok) return;

    this.setData({ deletingId: id });

    try {
      await request({ url: `/v1/analyses/${id}`, method: "DELETE" });

      const next = (this.data.items || []).filter((x) => String(x.id) !== id);
      this.setData({ items: next });
      wx.showToast({ title: "已删除", icon: "success" });

      // ✅ 同步更新缓存，避免切 tab 又出现旧数据
      const cache = getHistoryCache();
      if (cache && Array.isArray(cache.items)) {
        const nextCacheItems = cache.items.filter((x) => String(x.id) !== id);
        setHistoryCache({ at: Date.now(), items: nextCacheItems });
      }
    } catch (err) {
      console.error("[history] delete fail:", err);
      wx.showToast({ title: "删除失败", icon: "none" });
    } finally {
      this.setData({ deletingId: "" });
    }
  },

  onPullDownRefresh() {
    this.loadHistory({ force: true }).finally(() => wx.stopPullDownRefresh());
  },
});
