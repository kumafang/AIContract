// pages/profile/profile.js
const { request } = require("../../services/request");
const { setToken, getToken, clearToken } = require("../../services/storage");
const { BASE_URL } = require("../../services/config");

const { getMe, clearMeCache } = require("../../services/meService");
const { prepay, tryConfirmPaid, listOrders } = require("../../services/payService");

const LOCAL_PROFILE_KEY = "LOCAL_USER_PROFILE";

function formatDate(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function getLocalProfile() {
  try {
    return wx.getStorageSync(LOCAL_PROFILE_KEY) || null;
  } catch (e) {
    return null;
  }
}

function setLocalProfile(p) {
  try {
    wx.setStorageSync(LOCAL_PROFILE_KEY, p);
  } catch (e) {}
}

function clearLocalProfile() {
  try {
    wx.removeStorageSync(LOCAL_PROFILE_KEY);
  } catch (e) {}
}

function toFullUrl(maybePath) {
  const v = (maybePath || "").trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  const path = v.startsWith("/") ? v : "/" + v;
  return BASE_URL + path;
}

function applyMeToPage(ctx, me, opts = {}) {
  if (!me) return;

  const credits = Number(me.credits ?? 0);
  const displayName = (me.display_name || "").trim() || "微信用户";
  const registeredAt = me.created_at || "";

  const serverAvatar = toFullUrl(me.avatar_url);

  const current = ctx.data.avatarSrc || "";
  const keepLocalTemp =
    current.startsWith("wxfile://") || current.startsWith("http://tmp/");

  const avatarSrc = keepLocalTemp ? current : (serverAvatar || current);

  ctx.setData({
    registeredAt,
    editName: displayName,
    avatarSrc,
    credits,
    ...(opts.extraSetData || {}),
  });

  const lp = getLocalProfile() || {};
  setLocalProfile({
    ...lp,
    displayName,
    avatarSrc,
    credits,
    updatedAt: Date.now(),
  });
}

function formatFeeFenToYuan(fen) {
  const n = Number(fen ?? 0);
  return (n / 100).toFixed(2);
}

function formatTime(iso) {
  if (!iso) return "";
  return String(iso).slice(0, 19).replace("T", " ");
}

Page({
  data: {
    authed: false,
    isLoggingIn: false,
    loadingMe: false,

    credits: null,

    registeredAt: "",
    avatarSrc: "",
    editName: "微信用户",

    savingProfile: false,
    uploadingAvatar: false,
    saveHint: "",
    showEditModal: false,

    // ===== Orders (Recharge History) =====
    payOrders: [],       // 全量（已映射）
    displayOrders: [],   // 展示用（1条 or 全量）
    ordersLoading: false,
    ordersExpanded: false,

    // ===== Recharge =====
    showRechargeModal: false,
    paying: false,
    selectedSku: "CREDIT_30",
    skuList: [
      {
        id: "CREDIT_10",
        amount: 1,                  // 芒果币数量
        priceNow: "¥9.9",          // 当前价
        priceOrigin: "¥12.90",      // 原价（可为空/不传）
        promoTag: "马年限时特惠",        // 优惠原因（可为空/不传）
        desc: "适合首次体验",         // 可选：小文案
      },
      {
        id: "CREDIT_30",
        amount: 3,
        priceNow: "¥24.90",
        priceOrigin: "29.90",
        promoTag: "马年限时特惠",
        desc: "随时随地安心包",
      },
      {
        id: "CREDIT_100",
        amount: 10,
        priceNow: "¥69.90",
        priceOrigin: "¥89.90",
        promoTag: "马年限时特惠",
        desc: "高频常用包",
      },
    ],
  },

  async onShow() {
    const authed = !!getToken();
    this.setData({ authed });

    // 秒开：先用 LOCAL_PROFILE_KEY
    const lp = getLocalProfile();
    if (lp) {
      this.setData({
        avatarSrc: lp.avatarSrc || "",
        editName: lp.displayName || "微信用户",
        credits: Number(lp.credits ?? 0),
      });
    }

    if (!authed) {
      this.setData({
        registeredAt: "",
        saveHint: "",
        payOrders: [],
        displayOrders: [],
        ordersExpanded: false,
        ordersLoading: false,
      });
      return;
    }

    await this.loadMe({ force: false });
    await this.loadOrders(); // ✅ 统一：只用这一套
  },

  // ===== Profile Edit =====
  openEditProfile() {
    this.setData({ showEditModal: true, saveHint: "" });
  },
  closeEditProfile() {
    this.setData({ showEditModal: false, saveHint: "" });
  },

  async loadMe({ force } = { force: false }) {
    if (!getToken()) return;

    this.setData({ loadingMe: true });
    try {
      const res = await getMe({ force: !!force });
      if (res && res.ok && res.me) {
        applyMeToPage(this, res.me);
        return;
      }

      if (res && res.reason === "unauth") {
        clearToken();
        clearLocalProfile();
        clearMeCache();
        this.setData({
          authed: false,
          registeredAt: "",
          avatarSrc: "",
          editName: "微信用户",
          credits: null,
          showEditModal: false,
        });
      }
    } catch (e) {
      // 网络异常：不强制登出
    } finally {
      this.setData({ loadingMe: false });
    }
  },

  // ===== Orders =====
  _applyOrdersToView(rawOrders) {
    const list = Array.isArray(rawOrders) ? rawOrders : [];

    const mapped = list.map((it) => {
      const st = String(it.status || "");
      return {
        outTradeNo: it.outTradeNo,
        credits: Number(it.credits ?? 0),
        totalFee: Number(it.totalFee ?? 0),
        feeText: formatFeeFenToYuan(it.totalFee),
        createdAt: String(it.createdAt || ""),
        timeText: formatTime(it.createdAt),
        status: st,
        statusText: st === "PAID" ? "已支付" : st === "CREATED" ? "待支付" : "已关闭",
      };
    });

    const expanded = !!this.data.ordersExpanded;
    const displayOrders = expanded ? mapped : mapped.slice(0, 1);

    this.setData({
      payOrders: mapped,
      displayOrders,
    });
  },

  async loadOrders() {
    if (!getToken()) return;

    this.setData({ ordersLoading: true });
    try {
      // 期望后端返回：{ items: [...] }
      const res = await listOrders(20);
      const items = (res && res.items) || [];
      this._applyOrdersToView(items);
    } catch (e) {
      this.setData({ payOrders: [], displayOrders: [] });
    } finally {
      this.setData({ ordersLoading: false });
    }
  },

  toggleOrders() {
    const next = !this.data.ordersExpanded;
    const all = this.data.payOrders || [];
    this.setData({
      ordersExpanded: next,
      displayOrders: next ? all : all.slice(0, 1),
    });
  },

  // ===== Login =====
  onWechatLogin() {
    if (this.data.isLoggingIn) return;
    this.setData({ isLoggingIn: true });

    wx.login({
      success: async (r) => {
        const code = r && r.code;
        if (!code) {
          wx.showToast({ title: "获取 code 失败", icon: "none" });
          this.setData({ isLoggingIn: false });
          return;
        }

        try {
          const resp = await request({
            url: "/v1/auth/wechat/login",
            method: "POST",
            data: { code },
          });

          const token = resp && resp.access_token;
          if (!token) {
            wx.showToast({ title: "登录失败：无 token", icon: "none" });
            return;
          }

          setToken(token);
          this.setData({ authed: true });

          await this.loadMe({ force: true });
          await this.loadOrders();
          wx.showToast({ title: "登录成功", icon: "success" });
        } catch (e) {
          wx.showToast({ title: "登录失败", icon: "none" });
        } finally {
          this.setData({ isLoggingIn: false });
        }
      },
      fail: () => {
        wx.showToast({ title: "wx.login 失败", icon: "none" });
        this.setData({ isLoggingIn: false });
      },
    });
  },

  onNameInput(e) {
    const v = (e && e.detail && e.detail.value) || "";
    this.setData({ editName: v, saveHint: "" });
  },

  async onChooseAvatar(e) {
    const p = e && e.detail && e.detail.avatarUrl;
    if (!p) return;

    this.setData({
      avatarSrc: p,
      saveHint: "已选择头像，正在上传...",
      uploadingAvatar: true,
    });

    const lp = getLocalProfile() || {};
    setLocalProfile({ ...lp, avatarSrc: p, updatedAt: Date.now() });

    try {
      const token = getToken();
      if (!token) {
        this.setData({ saveHint: "未登录，无法上传头像", uploadingAvatar: false });
        return;
      }

      const uploadUrl = BASE_URL + "/v1/users/me/avatar";

      const res = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: uploadUrl,
          filePath: p,
          name: "file",
          header: { Authorization: `Bearer ${token}` },
          success: resolve,
          fail: reject,
        });
      });

      if (!res || res.statusCode < 200 || res.statusCode >= 300) {
        this.setData({ saveHint: "头像上传失败（后端返回异常）", uploadingAvatar: false });
        return;
      }

      let body = null;
      try {
        body = res.data ? JSON.parse(res.data) : null;
      } catch (err) {}

      const avatar_url = body && body.avatar_url;
      if (!avatar_url) {
        this.setData({ saveHint: "头像上传失败（无 avatar_url）", uploadingAvatar: false });
        return;
      }

      const full = toFullUrl(avatar_url);

      this.setData({
        avatarSrc: full,
        saveHint: "头像已上传并保存",
        uploadingAvatar: false,
      });

      const lp2 = getLocalProfile() || {};
      setLocalProfile({ ...lp2, avatarSrc: full, updatedAt: Date.now() });

      await this.loadMe({ force: true });
    } catch (err) {
      this.setData({ saveHint: "头像上传失败（网络/权限）", uploadingAvatar: false });
    }
  },

  async onSaveProfile() {
    if (this.data.savingProfile) return;

    if (!this.data.authed) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    const name = (this.data.editName || "").trim();
    if (!name) {
      wx.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }

    this.setData({ savingProfile: true, saveHint: "" });
    try {
      await request({
        url: "/v1/users/me",
        method: "PUT",
        data: { display_name: name },
      });

      const lp = getLocalProfile() || {};
      setLocalProfile({ ...lp, displayName: name, updatedAt: Date.now() });

      wx.showToast({ title: "保存成功", icon: "success" });
      this.closeEditProfile();

      await this.loadMe({ force: true });
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
      this.setData({ saveHint: "保存失败，请重试" });
    } finally {
      this.setData({ savingProfile: false });
    }
  },

  // ===== Recharge UI =====
  openRecharge() {
    if (!this.data.authed) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }
    this.setData({ showRechargeModal: true });
  },

  closeRecharge() {
    if (this.data.paying) return;
    this.setData({ showRechargeModal: false });
  },

  onPickSku(e) {
    const sku =
      e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.sku;
    if (!sku) return;
    this.setData({ selectedSku: sku });
  },

  async onPayNow() {
    if (this.data.paying) return;
    if (!this.data.authed) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return;
    }

    const sku = this.data.selectedSku;

    this.setData({ paying: true });
    try {
      const pre = await prepay(sku);
      const outTradeNo = pre && pre.outTradeNo;
      const params = pre && pre.paymentParams;

      if (!outTradeNo || !params) {
        wx.showToast({ title: "下单失败（缺少参数）", icon: "none" });
        return;
      }

      // 拉起支付
      await new Promise((resolve, reject) => {
        wx.requestPayment({
          ...params,
          success: resolve,
          fail: reject,
        });
      });

      // ✅ Toast 时间调长
      wx.showToast({ title: "支付成功", icon: "success", duration: 3500 });
      this.setData({ showRechargeModal: false });

      // ✅ 先刷新一次（多数情况 notify 已入账）
      const before = Number(this.data.credits ?? 0);
      await this.loadMe({ force: true });
      await this.loadOrders();
      const after = Number(this.data.credits ?? 0);

      // ✅ 若没涨：轻量补偿（最多 3 次，不阻塞 UI）
      if (!(after > before)) {
        setTimeout(async () => {
          try {
            await tryConfirmPaid(outTradeNo, { tries: 3, intervalMs: 900 });
            await this.loadMe({ force: true });
            await this.loadOrders();
          } catch (e) {}
        }, 600);
      }
    } catch (e) {
      const msg = (e && e.errMsg) || (e && e.message) || "";
      if (String(msg).includes("cancel")) {
        wx.showToast({ title: "已取消支付", icon: "none" });
      } else {
        wx.showToast({ title: "支付失败", icon: "none" });
      }
    } finally {
      this.setData({ paying: false });
    }
  },

  onLogout() {
    clearToken();
    clearLocalProfile();
    clearMeCache();

    this.setData({
      authed: false,
      isLoggingIn: false,
      loadingMe: false,
      registeredAt: "",
      avatarSrc: "",
      editName: "微信用户",
      credits: null,

      savingProfile: false,
      uploadingAvatar: false,
      saveHint: "",
      showEditModal: false,

      payOrders: [],
      displayOrders: [],
      ordersLoading: false,
      ordersExpanded: false,

      showRechargeModal: false,
      paying: false,
    });
    wx.showToast({ title: "已退出", icon: "success" });
  },

  onGoPrivacy() {
    wx.navigateTo({ url: "/pages/privacy/privacy" });
  },
  onGoAbout() {
    wx.navigateTo({ url: "/pages/about/about" });
  },
  onGoHelp() {
    wx.navigateTo({ url: "/pages/help/help" });
  },

  formatDate,
});
