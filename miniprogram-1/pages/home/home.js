// pages/home/home.js
const { compressImagePaths } = require("../../services/imageCompress");
const { getMe } = require("../../services/meService"); // async
const { getCache } = require("../../services/meCache"); // sync cache read
const { KINDTALK } = require("../../data/app");

// ✅ 统一：toast 后跳转 profile
function toastAndGoProfile(msg = "未登录，请先登入", delay = 1500) {
  wx.showToast({ title: msg, icon: "none", duration: 2000 });
  setTimeout(() => {
    wx.switchTab({ url: "/pages/profile/profile" });
  }, delay);
}

// ✅ 从缓存同步读 me（不会打接口）
function readMeFromCache() {
  const cache = getCache();
  const me = cache && cache.me ? cache.me : null;
  if (!me) return null;
  return me;
}

Page({
  data: {
    /* ====== 基础状态 ====== */
    identity: "A", // A | B
    identityLabel: "",
    selectedContractType: "general",
    kindtalk: KINDTALK,

    contractTypes: [
      { id: "general", label: "通用合同", emoji: "📄" },
      { id: "marriage", label: "婚姻财产", emoji: "💍" },
      { id: "house_sale", label: "房屋买卖", emoji: "🏠" },
      { id: "vehicle_sale", label: "车辆买卖", emoji: "🚗" },
      { id: "lease", label: "租赁相关", emoji: "🏢" },
      { id: "employment", label: "劳动合同", emoji: "🪪" },
      { id: "nda", label: "保密协议", emoji: "🔒" },
      { id: "service", label: "采购服务", emoji: "🤝" },
    ],

    /* ====== Credits (芒果币）====== */
    credits: null, // number | null
    creditsLoading: false,

    /* ====== 上传状态 ====== */
    uploaded: false,
    uploadedLabel: "",
    uploadedPayload: null,

    /* ====== 文本粘贴 ====== */
    showPasteModal: false,
    pasteContent: "",
    pasteContentTrimmed: false,

    /* ====== 分析确认弹窗 ====== */
    confirmOpen: false,
    pending: null,
    selectedTypeLabel: "",
    uploadMethod: null, // 'file' | 'text' | 'camera'
  },

  /* =========================================================
   * 生命周期
   * ======================================================= */
  onShow() {
    // ✅ camera 回传（你的原逻辑）
    const cam = wx.getStorageSync("CAMERA_UPLOAD");
    if (cam) {
      wx.removeStorageSync("CAMERA_UPLOAD");
      this.setData({
        uploadMethod: "camera",
        uploaded: true,
        uploadedLabel: cam.fileName || "拍照合同",
        uploadedPayload: {
          kind: "file",
          fileName: cam.fileName || "camera.jpg",
          mimeType: cam.mimeType || "image/jpeg",
          filePath: cam.path,
        },
      });
    }

    // ✅ 不打接口：只从缓存更新余额显示
    const me = readMeFromCache();
    if (me) {
      this.setData({ credits: Number(me.credits ?? 0) });
    } else {
      this.setData({ credits: null });
    }
  },

  /* =========================================================
   * Auth & Credits Guard（用 cache 快速拦截）
   * ======================================================= */
  checkAuthAndCreditsFromCache() {
    const me = readMeFromCache();

    // 没缓存：按“未登录”处理（或缓存过期/被清）
    if (!me) {
      toastAndGoProfile("未登录，请先登入", 1500);
      return { ok: false, reason: "unauth" };
    }

    const credits = Number(me.credits ?? 0);
    if (credits <= 0) {
      toastAndGoProfile("芒果币不足，请充值", 1500);
      return { ok: false, reason: "no_credits" };
    }

    return { ok: true, credits };
  },

  /* =========================================================
   * 身份 & 合同类型
   * ======================================================= */
  setIdentityA() {
    this.setData({ identity: "A" });
  },

  setIdentityB() {
    this.setData({ identity: "B" });
  },

  onSelectType(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedContractType: id });
  },

  /* =========================================================
   * 上传方式 1：文件上传
   * ======================================================= */
  onUploadFile() {
    this.setData({ uploadMethod: "file" });

    wx.chooseMessageFile({
      count: 1,
      type: "file",
      success: (res) => {
        const f = res.tempFiles?.[0];
        if (!f) return;

        this.setData({
          uploaded: true,
          uploadedLabel: f.name || "已选择文件",
          uploadedPayload: {
            kind: "file",
            fileName: f.name || "upload",
            mimeType: f.type || "application/octet-stream",
            filePath: f.path,
          },
        });
      },
    });
  },

  /* =========================================================
   * 上传方式 2：文本粘贴
   * ======================================================= */
  openPasteModal() {
    this.setData({ uploadMethod: "text", showPasteModal: true });
  },

  closePasteModal() {
    this.setData({
      showPasteModal: false,
      pasteContent: "",
      pasteContentTrimmed: false,
    });
  },

  onPasteInput(e) {
    const val = e.detail.value || "";
    this.setData({
      pasteContent: val,
      pasteContentTrimmed: !!val.trim(),
    });
  },

  onPasteNext() {
    const text = (this.data.pasteContent || "").trim();
    if (!text) return;

    this.setData({
      uploaded: true,
      uploadedLabel: `文本内容（${text.length} 字）`,
      uploadedPayload: {
        kind: "text",
        payload: text,
        length: text.length,
      },
      showPasteModal: false,
      pasteContent: "",
      pasteContentTrimmed: false,
    });
  },

  /* =========================================================
   * 上传方式 3：拍照（多图 + 压缩）
   * ======================================================= */
  goCamera() {
    this.setData({ uploadMethod: "camera" });

    wx.chooseImage({
      count: 9,
      sourceType: ["camera", "album"],
      success: async (res) => {
        try {
          const paths = res.tempFilePaths || [];
          if (!paths.length) return;

          wx.showLoading({ title: "图片压缩中…" });

          const compressedPaths = await compressImagePaths(this, paths, {
            maxSide: 2000,
            quality: 0.75,
            fileType: "jpg",
          });

          wx.hideLoading();

          this.setData({
            uploaded: true,
            uploadedLabel: `拍照合同（${compressedPaths.length} 张）`,
            uploadedPayload: {
              kind: "images",
              files: compressedPaths.map((p, i) => ({
                filePath: p,
                fileName: `page_${i + 1}.jpg`,
                mimeType: "image/jpeg",
              })),
            },
          });
        } catch (e) {
          wx.hideLoading();
          wx.showToast({ title: "压缩失败，已使用原图", icon: "none" });

          const paths = res.tempFilePaths || [];
          this.setData({
            uploaded: true,
            uploadedLabel: `拍照合同（${paths.length} 张）`,
            uploadedPayload: {
              kind: "images",
              files: paths.map((p, i) => ({
                filePath: p,
                fileName: `page_${i + 1}.jpg`,
                mimeType: "image/jpeg",
              })),
            },
          });
        }
      },
      fail: () => wx.showToast({ title: "未选择照片", icon: "none" }),
    });
  },

  /* =========================================================
   * 上传内容管理
   * ======================================================= */
  clearUploaded() {
    this.setData({
      uploaded: false,
      uploadedLabel: "",
      uploadedPayload: null,
    });
  },

  /* =========================================================
   * 开始分析（打开确认弹窗前拦截）
   * ======================================================= */
  onStartAnalyze() {
    if (!this.data.uploaded || !this.data.uploadedPayload) return;

    // ✅ 用 cache 快速拦截：未登录 / 芒果币不足
    const chk = this.checkAuthAndCreditsFromCache();
    if (!chk.ok) return;

    const typeObj = this.data.contractTypes.find(
      (t) => t.id === this.data.selectedContractType
    );

    // ✅ 关键：confirmOpen + pending 必须同时 set，WXML 才会显示弹窗
    this.setData({
      confirmOpen: true,
      pending: this.data.uploadedPayload,
      selectedTypeLabel: typeObj?.label || this.data.selectedContractType,
      identityLabel: this.data.identity === "A" ? "甲方" : "乙方",
    });
  },

  closeConfirm() {
    this.setData({ confirmOpen: false, pending: null });
  },

  /* =========================================================
   * 确认分析（真正开始前再兜底刷新一次）
   * ======================================================= */
  async confirmStart() {
    if (!this.data.pending || !this.data.uploadedPayload) return;

    // ✅ 兜底：强制刷新一次（防止弹窗停留期间余额变化/登录失效）
    this.setData({ creditsLoading: true });
    let res = null;
    try {
      res = await getMe({ force: true }); // async network
    } catch (e) {
      res = null;
    }
    this.setData({ creditsLoading: false });

    if (!res || !res.ok) {
      toastAndGoProfile("未登录，请先登入", 1500);
      return;
    }

    const credits = Number(res.credits ?? 0);
    this.setData({ credits });

    if (credits <= 0) {
      toastAndGoProfile("芒果币不足，请充值", 1500);
      return;
    }

    // 计算 identity / type label
    const identityLabel = this.data.identity === "A" ? "甲方" : "乙方";
    const typeObj = this.data.contractTypes.find(
      (t) => t.id === this.data.selectedContractType
    );
    const contractTypeLabel = typeObj?.label || this.data.selectedContractType;

    // ✅ 写入 analysis 页 payload
    wx.setStorageSync("ANALYSIS_PAYLOAD", {
      uploadPayload: this.data.uploadedPayload,
      identityLabel,
      contractTypeLabel,
    });

    // ✅ 关闭确认弹窗
    this.setData({ confirmOpen: false, pending: null });

    // ✅ 跳转 analysis
    wx.navigateTo({ url: "/pages/analysis/analysis" });
  },
});
