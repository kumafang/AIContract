// pages/analysis/analysis.js
const { BASE_URL } = require("../../services/config");
const { request } = require("../../services/request");
const { getToken } = require("../../services/storage");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function genBatchId() {
  return `b_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

Page({
  data: {
    progress: 0,
    progressText: "0",
    step: 0,

    uploadPayload: null,
    identityLabel: "",
    contractTypeLabel: "",

    isPdf: false,
    isDocx: false,
    isImage: false,
    isMultiImage: false,

    previewImage: "",
    imageCount: 0,

    finished: false,
    showCancelConfirm: false,
  },

  onLoad() {
    const payload = wx.getStorageSync("ANALYSIS_PAYLOAD");
    if (!payload) {
      wx.navigateBack();
      return;
    }

    const { uploadPayload, identityLabel, contractTypeLabel } = payload;

    const isPdf =
      uploadPayload.kind === "file" &&
      uploadPayload.mimeType === "application/pdf";

    const isDocx =
      uploadPayload.kind === "file" &&
      (uploadPayload.mimeType?.includes("word") ||
        uploadPayload.fileName?.toLowerCase().endsWith(".docx"));

    const isMultiImage = uploadPayload.kind === "images";

    const isImage =
      uploadPayload.kind === "file" &&
      (uploadPayload.mimeType?.startsWith("image") ||
        /\.(png|jpg|jpeg|webp)$/i.test(uploadPayload.fileName || ""));

    this.setData({
      uploadPayload,
      identityLabel,
      contractTypeLabel,
      isPdf,
      isDocx,
      isMultiImage,
      isImage,
      previewImage: isMultiImage
        ? uploadPayload.files?.[0]?.filePath || ""
        : isImage
        ? uploadPayload.filePath
        : "",
      imageCount: isMultiImage ? uploadPayload.files.length : 1,
    });

    this.startAnalysis();
  },

  onUnload() {
    this._cancelled = true;
    clearInterval(this._progressTimer);
    clearInterval(this._stepTimer);
  },

  async startAnalysis() {
    this._cancelled = false;

    // 进度条：先到 92%
    this._progressTimer = setInterval(() => {
      if (this.data.progress >= 92) return;
      const p = Math.min(92, this.data.progress + Math.random() * 2);
      this.setData({ progress: p, progressText: String(Math.round(p)) });
    }, 180);

    // Step 动画（0..3）
    this._stepTimer = setInterval(() => {
      if (this.data.step >= 3) return;
      this.setData({ step: this.data.step + 1 });
    }, 2200);

    try {
      const payload = this.data.uploadPayload;
      let result;

      if (payload.kind === "text") {
        result = await this.analyzeText(payload);
      } else if (payload.kind === "images") {
        result = await this.analyzeMultiImages(payload);
      } else {
        result = await this.analyzeSingleFile(payload);
      }

      if (this._cancelled) return;

      clearInterval(this._progressTimer);
      clearInterval(this._stepTimer);

      this.setData({
        progress: 100,
        progressText: "100",
        step: 4,
        finished: true,
      });

      setTimeout(() => {
        if (this._cancelled) return;
        wx.setStorageSync("ANALYSIS_RESULT", result);
        wx.redirectTo({ url: "/pages/report/report" });
      }, 900);
    } catch (err) {
      console.error("[analysis] failed:", err);
      clearInterval(this._progressTimer);
      clearInterval(this._stepTimer);

      wx.showToast({ title: "分析失败，请重试", icon: "none" });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  onCancelTap() {
    this.setData({ showCancelConfirm: true });
  },
  confirmCancel() {
    this._cancelled = true;
    this.setData({ showCancelConfirm: false });
    wx.navigateBack();
  },
  cancelCancel() {
    this.setData({ showCancelConfirm: false });
  },

  _identityAB() {
    return this.data.identityLabel === "甲方" ? "A" : "B";
  },

  _contractTypeId() {
    const label = this.data.contractTypeLabel;
    const map = {
      通用合同: "general",
      婚姻财产: "marriage",
      房屋买卖: "house_sale",
      车辆买卖: "vehicle_sale",
      租赁相关: "lease",
      劳动合同: "employment",
      保密协议: "nda",
      采购服务: "service",
    };
    return map[label] || "general";
  },

  async analyzeText(payload) {
    return await request({
      url: "/v1/contracts/analyze/text",
      method: "POST",
      data: {
        type: this._contractTypeId(),
        identity: this._identityAB(),
        content: payload.payload,
      },
    });
  },

  analyzeSingleFile(payload) {
    return new Promise((resolve, reject) => {
      const token = getToken();
      if (!token) return reject({ statusCode: 401, message: "Missing token" });

      wx.uploadFile({
        url: `${BASE_URL}/v1/contracts/analyze/upload`,
        filePath: payload.filePath,
        name: "file",
        timeout: 300000,
        header: { Authorization: `Bearer ${token}` },
        formData: {
          type: this._contractTypeId(),
          identity: this._identityAB(),
        },
        success: (res) => {
          if (this._cancelled) return;
          try {
            const data = JSON.parse(res.data);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject({ statusCode: res.statusCode, response: data });
          } catch (e) {
            reject(e);
          }
        },
        fail: (err) => {
          reject({
            errMsg: err?.errMsg,
            errno: err.errno,
            fullurl: url,
          });
        },
      });
    });
  },

  async analyzeMultiImages(payload) {
    const files = payload.files || [];
    if (!files.length) throw new Error("No images");

    const token = getToken();
    if (!token) throw new Error("Missing token");

    const batchId = genBatchId();
    const total = files.length;

    // 进入生成阶段，让用户预期“会慢”
    this.setData({ step: 3 });

    // 让进度条慢慢爬到 98（finalize 慢也有动静）
    clearInterval(this._progressTimer);
    this._progressTimer = setInterval(() => {
      if (this.data.progress >= 98) return;
      const p = Math.min(98, this.data.progress + Math.random() * 1.2);
      this.setData({ progress: p, progressText: String(Math.round(p)) });
    }, 220);

    // 1) 逐张上传（串行）
    for (let i = 0; i < files.length; i++) {
      if (this._cancelled) throw new Error("Cancelled");

      const f = files[i];
      const idx = i + 1;

      const resp = await this._uploadBatchOne({
        token,
        batchId,
        idx,
        total,
        filePath: f.filePath,
      });

      // 可选反馈
      const received = resp?.meta?.processedImages;
      if (received) {
        const base = Math.min(90, 10 + (received / total) * 80);
        if (base > this.data.progress) {
          this.setData({ progress: base, progressText: String(Math.round(base)) });
        }
      }

      await sleep(80);
    }

    if (this._cancelled) throw new Error("Cancelled");

    // 2) finalize（这里可能很慢，所以不用 request.js 的 15s timeout）
    return await this._finalizeBatchLong({ token, batchId });
  },

  _uploadBatchOne({ token, batchId, idx, total, filePath }) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${BASE_URL}/v1/contracts/analyze/upload/batch`,
        filePath,
        name: "file",
        timeout: 300000,
        header: { Authorization: `Bearer ${token}` },
        formData: {
          batch_id: batchId,
          idx,
          total,
          type: this._contractTypeId(),
          identity: this._identityAB(),
        },
        success: (res) => {
          if (this._cancelled) return;
          try {
            const data = JSON.parse(res.data);
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject({ statusCode: res.statusCode, response: data });
          } catch (e) {
            reject(e);
          }
        },
        fail: (err) => {
          reject({
            errMsg: err?.errMsg,
            errno: err.errno,
            fullUrl: url,
          });
        },
      });
    });
  },

  _finalizeBatchLong({ token, batchId }) {
    return new Promise((resolve, reject) => {
      const url = `${BASE_URL}/v1/contracts/analyze/upload/batch/finalize`;

      console.log("[finalize] url =", url);
      console.log("[finalize] batchId =", batchId);

      wx.request({
        url,
        method: "POST",
        timeout: 300000, // ✅ 关键：给 finalize 足够时间
        header: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        data: { batch_id: batchId },
        success: (res) => {
          if (this._cancelled) return;
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
          else reject({ statusCode: res.statusCode, response: res.data });
        },
        fail: (err) => {
          reject({ errMsg: err?.errMsg, errno: err?.errno, fullUrl: url });
        },
      });
    });
  },
});
