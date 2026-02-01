// pages/privacy/privacy.js
const { PRIVACY_TITLE, PRIVACY_TEXT } = require("../../data/privacy");

Page({
  data: {
    title: PRIVACY_TITLE,
    content: PRIVACY_TEXT,
  },

  onBack() {
    wx.navigateBack();
  },
});
