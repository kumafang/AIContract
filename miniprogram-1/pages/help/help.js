// pages/help/help.js
const {
  SUPPORT_EMAIL,
  HELP_FAQ,
  FEEDBACK_PLACEHOLDER,
  FEEDBACK_TIPS,
} = require("../../data/help");

const { APP_VERSION } = require("../../data/app"); // 你上一步已创建 data/app.js

const FEEDBACK_STORAGE_KEY = "USER_FEEDBACKS";

Page({
  data: {
    // FAQ
    sections: Array.isArray(HELP_FAQ) ? HELP_FAQ : [],
    openKey: null,

    // Feedback
    feedback: "",
    contact: "",
    placeholder: FEEDBACK_PLACEHOLDER,
    tips: FEEDBACK_TIPS,

    // Contact
    supportEmail: SUPPORT_EMAIL,

    // Meta
    appVersion: APP_VERSION,
    submitting: false,
  },

  onBack() {
    wx.navigateBack();
  },

  toggleFAQ(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({
      openKey: this.data.openKey === key ? null : key,
    });
  },

  onInputFeedback(e) {
    this.setData({ feedback: e.detail.value });
  },

  onInputContact(e) {
    this.setData({ contact: e.detail.value });
  },

  submitFeedback() {
    const content = (this.data.feedback || "").trim();
    if (!content) {
      wx.showToast({ title: "请先填写反馈内容", icon: "none" });
      return;
    }

    // ✅ P0：先本地收集（后续再接 API / 云函数）
    const now = new Date();
    const createdAt = now.toISOString();

    let sys = {};
    try {
      sys = wx.getSystemInfoSync();
    } catch (e) {}

    const payload = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt,
      appVersion: this.data.appVersion,
      page: "help",
      content,
      contact: (this.data.contact || "").trim(),
      system: {
        model: sys.model,
        system: sys.system,
        version: sys.version,
        SDKVersion: sys.SDKVersion,
        brand: sys.brand,
        platform: sys.platform,
        screenWidth: sys.screenWidth,
        screenHeight: sys.screenHeight,
        language: sys.language,
      },
    };

    const list = wx.getStorageSync(FEEDBACK_STORAGE_KEY) || [];
    const next = Array.isArray(list) ? [payload, ...list].slice(0, 50) : [payload];
    wx.setStorageSync(FEEDBACK_STORAGE_KEY, next);

    wx.showModal({
      title: "已收到反馈",
      content: "谢谢！我们已记录你的反馈（本地保存，后续将接入在线提交）。",
      confirmText: "复制反馈",
      cancelText: "好的",
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: content,
            success: () => wx.showToast({ title: "已复制", icon: "success" }),
          });
        }
      },
    });

    // 清空输入
    this.setData({ feedback: "", contact: "" });
  },

  // 可选：点击邮箱复制（作为兜底展示）
  copyEmail() {
    wx.setClipboardData({
      data: this.data.supportEmail,
      success: () => wx.showToast({ title: "邮箱已复制", icon: "success" }),
    });
  },
});
