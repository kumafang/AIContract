// pages/about/about.js
const { APP_NAME, APP_VERSION, ABOUT_TEXT, CHANGELOG, DISCLAIMER } = require("../../data/app");

Page({
  data: {
    appName: APP_NAME,
    appVersion: APP_VERSION,
    aboutText: ABOUT_TEXT,
    changelog: CHANGELOG,
    disclaimer: DISCLAIMER,
  },

  onBack() {
    wx.navigateBack();
  },
});
