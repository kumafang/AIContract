// pages/networktest/networktest.js
const { BASE_URL } = require("../../services/config");
const { request } = require("../../services/request");

Page({
  data: {
    baseUrl: BASE_URL,
    resultText: "尚未测试",
  },

  onBack() {
    wx.navigateBack();
  },

  async runHealth() {
    this.setData({ resultText: "请求中..." });
    try {
      const data = await request({ url: "/health", method: "GET" });
      this.setData({
        resultText: `✅ SUCCESS\n${JSON.stringify(data, null, 2)}`,
      });
    } catch (e) {
      this.setData({
        resultText: `❌ FAIL\n${JSON.stringify(e, null, 2)}`,
      });
    }
  },
});
