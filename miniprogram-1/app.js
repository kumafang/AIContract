// app.js
const PRIVACY_ACCEPTED_KEY = "PRIVACY_ACCEPTED";
const PRIVACY_VIEWED_KEY = "PRIVACY_VIEWED_ONCE";

App({
  onLaunch() {
    // 你原本 onLaunch 逻辑放在这里（如果有）
    console.log("[privacy] onLaunch");
    this.ensurePrivacyConsent();
  },

  onShow() {
    // 你原本 onShow 逻辑放在这里（如果有）
    console.log("[privacy] onShow");
    this.ensurePrivacyConsent();
  },

  ensurePrivacyConsent() {
    console.log("[privacy] ensurePrivacyConsent called");

    if (wx.getStorageSync(PRIVACY_ACCEPTED_KEY)) {
      console.log("[privacy] already accepted");
      return;
    }

    // 防止重复弹
    if (this._privacyPrompting) {
      console.log("[privacy] prompting in progress");
      return;
    }
    this._privacyPrompting = true;

    const viewedOnce = !!wx.getStorageSync(PRIVACY_VIEWED_KEY);
    console.log("[privacy] viewedOnce =", viewedOnce);

    if (!viewedOnce) {
      // ✅ 避免被 loading/toast/自定义遮罩影响
      try { wx.hideLoading(); } catch (e) {}
      try { wx.hideToast(); } catch (e) {}
    
      // ✅ 延迟到下一帧，确保 UI 树 ready（DevTools/部分机型更稳）
      setTimeout(() => {
        wx.showModal({
          title: "隐私保护提示",
          content:
            "在你使用【签前助手】前，我们需要你阅读并同意《隐私协议》。\n\n点击「查看协议」可阅读全文；点击「同意并继续」后即可正常使用。",
          confirmText: "同意并继续",
          cancelText: "查看协议",
          success: (res) => {
            if (res.confirm) {
              wx.setStorageSync("PRIVACY_ACCEPTED", true);
            } else {
              wx.setStorageSync("PRIVACY_VIEWED_ONCE", true);
              wx.navigateTo({ url: "/pages/privacy/privacy" });
            }
          },
          complete: () => {
            this._privacyPrompting = false;
          },
        });
      }, 0);
    
      return;
    }
    
    
    setTimeout(() => {
      wx.showModal({
        title: "请先同意隐私协议",
        content: "你已查看《隐私协议》。如不同意，将无法继续使用本小程序。",
        confirmText: "同意",
        cancelText: "不同意",
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync(PRIVACY_ACCEPTED_KEY, true);
          } else {
            if (wx.exitMiniProgram) wx.exitMiniProgram();
            else wx.showToast({ title: "请关闭小程序", icon: "none" });
          }
        },
        complete: () => {
          this._privacyPrompting = false;
        },
      });
    },0);
  },
});
