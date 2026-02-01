// pages/camera/camera.js
Page({
  onLoad() {
    wx.chooseImage({
      count: 1,
      sourceType: ["camera", "album"],
      success: (res) => {
        const path = res.tempFilePaths?.[0];
        if (!path) {
          wx.navigateBack();
          return;
        }
        // ✅ 把图片路径存起来，供 Home 使用
        wx.setStorageSync("CAMERA_UPLOAD", {
          path,
          mimeType: "image/jpeg",
          fileName: "拍照合同.jpg"
        });
        
        // 你后面已有逻辑：转 base64 → 回 home
        wx.navigateBack();
      },
      fail: () => {
        wx.showToast({ title: "未授权相机或相册", icon: "none" });
        wx.navigateBack();
      }
    });
  }
});
