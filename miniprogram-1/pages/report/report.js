// pages/report/report.js
const { BASE_URL } = require("../../services/config");

const DISCLAIMER =
  "免责声明：本报告由AI基于你提供的合同文本生成，仅供参考，不构成法律意见。AI可能出现遗漏、误判或过时信息。涉及重大交易/争议，请咨询专业律师并以合同原文与适用法律为准。";

Page({
  data: {
    analysis: null,
    contractName: "",

    // ✅ Share (新增)
    shareId: "",
    shareExpiresAt: "",
    sharePreparing: false,

    // UI state
    showOriginal: false,

    // derived UI
    headerTitle: "风险分析报告",
    scoreTitle: "", // 主标题
    lotName: "", // 签名：上上签/中签/下下签...
    lotEmoji: "", // 签名 emoji
    ringColor: "rgb(245,158,11)", // 圆环颜色（连续变化）
    progressDashOffset: 0, // 圆环进度偏移
    disclaimer: DISCLAIMER,

    // meter UI
    meterPercent: 0,
    meterColor: "rgb(245,158,11)",
    meterLeft: "calc(0% - 18rpx)",
  },

  onLoad() {
    const analysis = wx.getStorageSync("ANALYSIS_RESULT");
    if (!analysis) {
      wx.navigateBack();
      return;
    }

    // ——字段兜底——
    const safe = {
      id: analysis.id, // ✅ 新增：用于创建分享
      name: analysis.name || "contract",
      score:
        typeof analysis.score === "number"
          ? analysis.score
          : Number(analysis.score || 0),
      riskSummary: analysis.riskSummary || "",
      originalContent: analysis.originalContent || "",
      clauses: Array.isArray(analysis.clauses) ? analysis.clauses : [],
      fileUrl: analysis.fileUrl,
    };

    const score = this._clampScore(safe.score);

    // ===== 新增：合同名称（用于报告展示）=====
    let contractName = (analysis && analysis.name) ? String(analysis.name).trim() : "";

    // 圆环参数（r=80 => 502.4）
    const CIRC = 502.4;
    const dashOffset = CIRC - (CIRC * score) / 100;

    // ✅ 连续环颜色
    const ringColor = this._scoreToRingColor(score);

    // ✅ 标题 + 签名
    const scoreTitle = this._getScoreTitle(score);
    const { lotName, lotEmoji } = this._getLot(score);

    // =========================================================
    // SECTION A: 风险条款排序（HIGH -> MEDIUM -> LOW）+ 预计算样式
    // =========================================================
    const levelWeight = (lvl) => {
      const u = String(lvl || "").toUpperCase();
      if (u === "HIGH") return 3;
      if (u === "MEDIUM") return 2;
      if (u === "LOW") return 1;
      return 0;
    };

    const levelToCn = (lvl) => {
      const u = String(lvl || "").toUpperCase();
      if (u === "HIGH") return "高风险，建议改";     // 方案A
      if (u === "MEDIUM") return "中风险，需留意";
      if (u === "LOW") return "低风险，可接受";
      return "";
    };
    
    // 1) 先排序（严重程度降序），同级保持原顺序（稳定排序：加 index）
    const clausesSorted = (safe.clauses || [])
      .map((c, idx) => ({ ...c, __idx: idx }))
      .sort((a, b) => {
        const wa = levelWeight(a.level);
        const wb = levelWeight(b.level);
        if (wb !== wa) return wb - wa;
        return a.__idx - b.__idx;
      })
      .map((c) => {
        const levelUpper = String(c.level || "").toUpperCase();
        const { __idx, ...rest } = c;
        return {
          ...rest,
          levelUpper,
          levelCn: levelToCn(levelUpper), 
          bgClass: this._levelToBgClass(levelUpper),
          textClass: this._levelToTextClass(levelUpper),
        };
      });

    // meter 参数
    const meterPercent = score; // 0..100
    const meterColor = ringColor;
    const meterLeft = `calc(${meterPercent}% - 18rpx)`; // 18rpx ≈ 指示点半径

    this.setData(
      {
        analysis: { ...safe, score, clauses: clausesSorted },
        contractName,
        scoreTitle,
        lotName,
        lotEmoji,
        ringColor,
        progressDashOffset: dashOffset,
        meterPercent,
        meterColor,
        meterLeft,
      },
      () => {
        // ✅ 新增：Report 页加载完成后预生成 shareId，杜绝 undefined
        this._prepareShareId();
      }
    );
  },

  onBack() {
    wx.navigateBack();
  },

  toggleOriginal() {
    this.setData({ showOriginal: !this.data.showOriginal });
  },

  // =========================================================
  // ✅ SECTION: 分享预生成（新增）
  // =========================================================
  async _prepareShareId() {
    if (this.data.sharePreparing) return;
    if (this.data.shareId) return;

    const analysisId = this.data.analysis?.id;
    if (!analysisId) return;

    this.setData({ sharePreparing: true });

    try {
      const res = await this._authedRequest({
        url: `${BASE_URL}/v1/shares`,
        method: "POST",
        data: { analysis_id: String(analysisId), contractName: this.data.contractName || "", },
      });

      if (res && res.shareId) {
        this.setData({
          shareId: res.shareId,
          shareExpiresAt: res.expiresAt || "",
        });
      }
    } catch (e) {
      // 不打扰用户；分享时会有兜底不返回 undefined
      // console.log("prepareShareId failed", e);
    } finally {
      this.setData({ sharePreparing: false });
    }
  },

  _getAnyToken() {
    // 兼容你项目里可能用的多种 key（不依赖 services/storage.js，避免猜路径/实现）
    const keys = ["ACCESS_TOKEN", "access_token", "token", "AUTH_TOKEN", "jwt"];
    for (const k of keys) {
      const v = wx.getStorageSync(k);
      if (v && typeof v === "string") return v;
    }
    return "";
  },

  _authedRequest({ url, method, data }) {
    const token = this._getAnyToken();
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method,
        data,
        header: token ? { Authorization: `Bearer ${token}` } : {},
        success(res) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data);
          } else {
            reject(res);
          }
        },
        fail: reject,
      });
    });
  },

  // =========================================================
  // SECTION B: 右上角“下载”按钮 → 生成海报并保存到相册
  // 你在 WXML 里把 ⇩ 绑定到 onDownloadPoster 即可复用
  // =========================================================
  async onDownloadPoster() {
    try {
      if (!this.data.analysis) return;

      wx.showLoading({ title: "生成海报中…" });

      // 1) 生成海报（canvas）
      const tempPath = await this._renderPosterToTempFile();

      // 2) 保存到相册（含授权处理）
      await this._saveImageToAlbum(tempPath);

      wx.hideLoading();
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: e?.message || "生成失败", icon: "none" });
    }
  },

  /* ---------------- helpers: score/ui ---------------- */

  _clampScore(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > 100) return 100;
    return Math.round(n);
  },

  _getScoreTitle(score) {
    if (score >= 90) return "整体安全";
    if (score >= 70) return "大致安全，稍作留意";
    if (score >= 40) return "再考虑一下，需重点修改";
    return "强烈建议先停一停，不着急签";
  },

  _getLot(score) {
    if (score >= 90) return { lotName: "上上签", lotEmoji: "🧧" };
    if (score >= 80) return { lotName: "上签", lotEmoji: "✨" };
    if (score >= 70) return { lotName: "中上签", lotEmoji: "🙂" };
    if (score >= 55) return { lotName: "中签", lotEmoji: "📝" };
    if (score >= 40) return { lotName: "下签", lotEmoji: "⚠️" };
    return { lotName: "下下签", lotEmoji: "⛔️" };
  },

  _levelToBgClass(level) {
    const l = String(level || "").toUpperCase();
    if (l === "HIGH") return "clause--high";
    if (l === "MEDIUM") return "clause--medium";
    if (l === "LOW") return "clause--low";
    return "";
  },

  _levelToTextClass(level) {
    const l = String(level || "").toUpperCase();
    if (l === "HIGH") return "risk-text--high";
    if (l === "MEDIUM") return "risk-text--medium";
    if (l === "LOW") return "risk-text--low";
    return "risk-text--default";
  },

  // 连续色：红(#e5484d)->橙(#f59e0b)->绿(#22c55e)
  _scoreToRingColor(score) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);

    const c1 = { r: 229, g: 72, b: 77 }; // red
    const c2 = { r: 245, g: 158, b: 11 }; // amber
    const c3 = { r: 34, g: 197, b: 94 }; // green

    let r, g, b;
    if (s <= 50) {
      const t = s / 50;
      r = lerp(c1.r, c2.r, t);
      g = lerp(c1.g, c2.g, t);
      b = lerp(c1.b, c2.b, t);
    } else {
      const t = (s - 50) / 50;
      r = lerp(c2.r, c3.r, t);
      g = lerp(c2.g, c3.g, t);
      b = lerp(c2.b, c3.b, t);
    }

    return `rgb(${r},${g},${b})`;
  },

  // =========================================================
  // SECTION C: 海报渲染（科技风最大程度靠近参考图）
  // 你后续想调风格，只需要改这里的参数和绘制顺序
  // =========================================================

  // ===== Poster Style Params (你未来自己调) =====
  _posterStyle() {
    return {
      // 画布尺寸（px）——建议用 750 宽保持高清
      W: 750,
      // 内容高度会动态计算，最低给一个
      MIN_H: 1000,

      // 背景（深蓝灰）
      bgTop: "#0B1220",
      bgBottom: "#0A1A2E",

      // 面板（玻璃感）
      panelX: 24,
      panelY: 16,
      panelW: 702,
      panelRadius: 32,
      panelFill: "rgba(18, 32, 54, 0.62)",
      panelStroke: "rgba(96, 225, 255, 0.35)",

      // 霓虹高亮线（冷青）
      neon: "rgba(110, 247, 255, 0.85)",
      neonSoft: "rgba(110, 247, 255, 0.25)",

      // 标题
      title: "签前助手",
      subtitle: "风险分析报告",

      // 字体（小程序 canvas 字体支持有限，先用系统字体）
      fontStrong: "sans-serif",
      fontMono: "monospace",

      // 二维码
      qrPath: "/assets/MPQrcode.jpg",
      qrSize: 96,

      // 底部免责声明块
      disclaimerFill: "rgba(255,255,255,0.08)",
      disclaimerStroke: "rgba(110,247,255,0.18)",
    };
  },

  async _renderPosterToTempFile() {
    const style = this._posterStyle();
    const { analysis, scoreTitle, contractName } = this.data;
    const score = this._clampScore(analysis.score);
    const ringColor = this._scoreToRingColor(score);

    // 先估算文本高度（风险摘要）
    const summary = analysis.riskSummary || "暂无风险摘要";
    const summaryLines = this._wrapTextByWidth(summary, 24, style.W - 2 * 80, 2); // 最多给 2 段估算
    // 动态高度：给摘要多留空间
    const H = Math.max(style.MIN_H, 980 + summaryLines.length * 30);

    // canvas 需要在 wxml 里有 <canvas canvas-id="posterCanvas" ... />
    const ctx = wx.createCanvasContext("posterCanvas", this);

    // ---- Layer 1: 背景渐变 ----
    this._drawLinearGradientBG(ctx, 0, 0, style.W, H, style.bgTop, style.bgBottom);
    // 增加少量“星尘噪点”（极轻）
    this._drawDust(ctx, style.W, H);

    // ---- Layer 2: 主玻璃面板 ----
    const panelH = H - 40;
    this._roundedRect(ctx, style.panelX, style.panelY, style.panelW, panelH, style.panelRadius, {
      fill: style.panelFill,
      stroke: style.panelStroke,
      lineWidth: 2,
    });

    // 面板内轻微网格（简化科技纹理）
    this._drawGrid(ctx, style.panelX + 20, style.panelY + 20, style.panelW - 40, panelH - 40);

    // ---- Layer 3: 左侧分数圆环（长度 + 颜色随分数变化） ----
    // 位置参考图：左上偏中
    const ringCX = style.W / 2;
    const ringCY = style.panelY + 230;
    const ringR = 150;

    this._drawScoreRing(ctx, ringCX, ringCY, ringR, score, ringColor, style.neonSoft);

    // ===== 合同名称（分数环标题）=====
    ctx.setFillStyle("rgba(255,255,255,0.85)");
    ctx.setFontSize(22);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("bottom");

    // 超长名称简单截断（防止破版）
    const displayName =
      contractName.length > 20 ? contractName.slice(0, 18) + "…" : contractName;

    ctx.fillText(displayName, ringCX, ringCY - ringR + 68);

    // 分数文字（92%）
    ctx.setFillStyle("#FFFFFF");
    ctx.setFontSize(130);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("middle");
    ctx.fillText(`${score}`, ringCX, ringCY);

    // REVIEW SCORE 小字
    ctx.setFillStyle("rgba(255,255,255,0.75)");
    ctx.setFontSize(18);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("top");
    ctx.fillText("风险评估分", ringCX, ringCY + 62);

    // ---- Layer 4: 右上标题 ----
    const disclaimerY = style.panelY + panelH - 180;

    ctx.setTextAlign("left");
    ctx.setTextBaseline("middle");
    ctx.setFillStyle("rgba(255,255,255,0.9)");
    ctx.setFontSize(36);
    ctx.fillText(style.title, style.panelX + 60, disclaimerY - 50);

    ctx.setFillStyle("rgba(255,255,255,0.55)");
    ctx.setFontSize(16);
    ctx.fillText(style.subtitle, style.panelX + 60, disclaimerY - 22);

    // ---- Layer 5: 右侧二维码圆环 + 图片 ----
    const qrRingCX = style.panelX + style.panelW - 140;
    const qrRingCY = disclaimerY + 70;
    const qrRingR = 60;

    // ✅ 二维码贴纸（让白底“合理化”）
    const stickerSize = 132;     // 贴纸整体大小（比二维码大一圈）
    const padding = 12;          // 贴纸内边距
    const stickerX = qrRingCX - stickerSize / 2;
    const stickerY = qrRingCY - stickerSize / 2;

    // 1) 先画贴纸底
    this._drawQrSticker(ctx, stickerX, stickerY, stickerSize, stickerSize);

    // 2) 再把二维码画进贴纸里（留出 padding，让它更像设计好的组件）
    await this._drawImageSafe(
      ctx,
      style.qrPath,
      stickerX + padding,
      stickerY + padding,
      stickerSize - padding * 2,
      stickerSize - padding * 2
    );

    ctx.setFillStyle("rgba(110,247,255,0.85)");
    ctx.setFontSize(18);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("top");
    ctx.fillText("扫码访问签前助手小程序", qrRingCX, qrRingCY + qrRingR + 18);

    // ---- Layer 6: 风险摘要（唯一正文） ----
    // 摘要标题
    const contentX = style.panelX + 60;
    let y = style.panelY + 430;

    ctx.setTextAlign("left");
    ctx.setTextBaseline("top");
    ctx.setFillStyle("rgba(255,255,255,0.85)");
    ctx.setFontSize(20);
    ctx.fillText("风险摘要", contentX, y);

    // 分割细线
    y += 34;
    ctx.setStrokeStyle("rgba(110,247,255,0.22)");
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(contentX, y);
    ctx.lineTo(contentX + 600, y);
    ctx.stroke();

    // ✅ 插入 scoreTitle（大字）
    y += 18;

    ctx.setFillStyle("rgba(255,255,255,0.95)");
    ctx.setFontSize(34);
    ctx.setTextAlign("left");
    ctx.setTextBaseline("top");
    ctx.fillText(scoreTitle, contentX, y);

    y += 40;

    // 摘要正文
    y += 18;
    ctx.setFillStyle("rgba(255,255,255,0.75)");
    ctx.setFontSize(22);
    y = this._drawWrappedText(ctx, summary, contentX, y, style.W - 2 * 80, 34);

    // ---- Layer 7: 底部免责声明块 ----
    const boxX = style.panelX + 60;
    const boxW = style.panelW - 340;
    const boxH = 140;
    const boxY = style.panelY + panelH - 180;

    this._roundedRect(ctx, boxX, boxY, boxW, boxH, 18, {
      fill: style.disclaimerFill,
      stroke: style.disclaimerStroke,
      lineWidth: 1,
    });

    ctx.setFillStyle("rgba(255,255,255,0.75)");
    ctx.setFontSize(13);
    ctx.setTextAlign("left");
    ctx.setTextBaseline("top");
    this._drawWrappedText(
      ctx,
      this.data.disclaimer || DISCLAIMER,
      boxX + 18,
      boxY + 18,
      boxW - 36,
      26
    );

    // ---- Draw & export ----
    await new Promise((resolve) => ctx.draw(false, resolve));

    const tempPath = await new Promise((resolve, reject) => {
      wx.canvasToTempFilePath(
        {
          canvasId: "posterCanvas",
          fileType: "png",
          quality: 1,
          success: (res) => resolve(res.tempFilePath),
          fail: reject,
        },
        this
      );
    });

    return tempPath;
  },
  
  _drawQrSticker(ctx, x, y, w, h) {
    // 轻阴影（让它像“贴纸”而不是突兀白块）
    ctx.save();
    ctx.setShadow(0, 8, 18, "rgba(0,0,0,0.22)");
  
    // 白色贴纸底
    this._roundedRect(ctx, x, y, w, h, 18, {
      fill: "rgba(255,255,255,0.96)",
      stroke: "rgba(110,247,255,0.18)",
      lineWidth: 1,
    });
  
    ctx.restore();
  
    // 贴纸内微弱高光（更精致，但很克制）
    ctx.save();
    ctx.setFillStyle("rgba(255,255,255,0.10)");
    this._roundedRect(ctx, x + 2, y + 2, w - 4, Math.floor(h * 0.45), 16, {
      fill: "rgba(255,255,255,0.10)",
      stroke: null,
      lineWidth: 0,
    });
    ctx.restore();
  },
  
  async _saveImageToAlbum(filePath) {
    // 先试保存
    try {
      await new Promise((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath,
          success: resolve,
          fail: reject,
        });
      });
      return;
    } catch (e) {
      // 可能没权限，走授权流程
    }

    const setting = await new Promise((resolve) => {
      wx.getSetting({ success: resolve, fail: () => resolve({}) });
    });

    const hasAuth = setting?.authSetting?.["scope.writePhotosAlbum"];
    if (hasAuth === false) {
      // 用户曾经拒绝过：引导打开设置
      await new Promise((resolve) => {
        wx.showModal({
          title: "需要相册权限",
          content: "保存海报需要访问相册权限，请在设置中开启。",
          confirmText: "去设置",
          success: (r) => {
            if (!r.confirm) return resolve();
            wx.openSetting({ success: resolve, fail: resolve });
          },
          fail: resolve,
        });
      });
    } else {
      // 未询问过：请求授权
      await new Promise((resolve) => {
        wx.authorize({
          scope: "scope.writePhotosAlbum",
          success: resolve,
          fail: resolve,
        });
      });
    }

    // 再试一次保存
    await new Promise((resolve, reject) => {
      wx.saveImageToPhotosAlbum({
        filePath,
        success: resolve,
        fail: reject,
      });
    });
  },

  // =========================
  // SECTION D: 画图工具函数
  // =========================

  _drawLinearGradientBG(ctx, x, y, w, h, topColor, bottomColor) {
    const grd = ctx.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, topColor);
    grd.addColorStop(1, bottomColor);
    ctx.setFillStyle(grd);
    ctx.fillRect(x, y, w, h);
  },

  _roundedRect(ctx, x, y, w, h, r, { fill, stroke, lineWidth }) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();

    if (fill) {
      ctx.setFillStyle(fill);
      ctx.fill();
    }
    if (stroke) {
      ctx.setStrokeStyle(stroke);
      ctx.setLineWidth(lineWidth || 1);
      ctx.stroke();
    }
  },

  _drawGrid(ctx, x, y, w, h) {
    ctx.setStrokeStyle("rgba(255,255,255,0.04)");
    ctx.setLineWidth(1);
    const step = 26;
    for (let i = 0; i <= w; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }
    for (let j = 0; j <= h; j += step) {
      ctx.beginPath();
      ctx.moveTo(x, y + j);
      ctx.lineTo(x + w, y + j);
      ctx.stroke();
    }
  },

  _drawDust(ctx, W, H) {
    // 极轻“星尘”，不要太多
    const n = 90;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const a = 0.05 + Math.random() * 0.12;
      ctx.setFillStyle(`rgba(255,255,255,${a})`);
      ctx.fillRect(x, y, 2, 2);
    }
  },

  // 分数环：长度随 score 变化，颜色随 ringColor 变化
  _drawScoreRing(ctx, cx, cy, r, score, ringColor, softColor) {
    const start = -Math.PI / 2; // 从顶部开始
    const end = start + (Math.PI * 2 * score) / 100;

    // 外层柔光圈
    ctx.setStrokeStyle(softColor);
    ctx.setLineWidth(10);
    ctx.setLineCap("round");
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.stroke();

    // 背景环
    ctx.setStrokeStyle("rgba(255,255,255,0.10)");
    ctx.setLineWidth(10);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 进度弧（长度/颜色随分数）
    ctx.setStrokeStyle(ringColor);
    ctx.setLineWidth(10);
    ctx.setLineCap("round");
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();

    // 虚线装饰（模拟参考图的科技虚线感）
    ctx.setStrokeStyle("rgba(110,247,255,0.35)");
    ctx.setLineWidth(2);
    const dashCount = 30;
    for (let i = 0; i < dashCount; i++) {
      const a1 = start + (Math.PI * 2 * i) / dashCount;
      const a2 = a1 + 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 18, a1, a2);
      ctx.stroke();
    }
  },

  _drawQrRing(ctx, cx, cy, r, neon, neonSoft) {
    // 外层柔光
    ctx.setStrokeStyle(neonSoft);
    ctx.setLineWidth(10);
    ctx.setLineCap("round");
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.stroke();

    // 主环
    ctx.setStrokeStyle(neon);
    ctx.setLineWidth(6);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 内层细环
    ctx.setStrokeStyle("rgba(255,255,255,0.12)");
    ctx.setLineWidth(2);
    ctx.beginPath();
    ctx.arc(cx, cy, r - 18, 0, Math.PI * 2);
    ctx.stroke();
  },

  async _drawImageSafe(ctx, path, x, y, w, h) {
    // 小程序 canvas drawImage 需要图片可用。这里先做一次 getImageInfo，确保真机也稳。
    const abs = path.startsWith("/") ? path : `/${path}`;
    const info = await new Promise((resolve, reject) => {
      wx.getImageInfo({
        src: path,
        success: resolve,
        fail: reject,
      });
    });
    ctx.drawImage(info.path, x, y, w, h);
  },

  _wrapTextByWidth(text, fontSize, maxWidth, _dummy) {
    // 仅用于估算，不追求极准
    const t = String(text || "");
    if (!t) return [""];
    // 粗略：中文约 fontSize，英文约 0.6*fontSize
    const estChar = Math.max(1, Math.floor(maxWidth / (fontSize * 0.9)));
    const lines = [];
    for (let i = 0; i < t.length; i += estChar) {
      lines.push(t.slice(i, i + estChar));
    }
    return lines;
  },

  _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const str = String(text || "");
    let line = "";
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const test = line + ch;
      const w = ctx.measureText(test).width;
      if (w > maxWidth && line) {
        ctx.fillText(line, x, y);
        line = ch;
        y += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
    return y + lineHeight;
  },

  // ✅ 分享：兜底不返回 undefined
  onShareAppMessage() {
    const { shareId, contractName } = this.data;

    // 如果 shareId 还没生成好，先返回一个安全路径（绝不出现 undefined）
    if (!shareId) {
      return {
        title: `《${contractName || "合同"}》风险分析报告`,
        desc: "AI 风险分析摘要，仅供参考",
        path: `/pages/home/home`,
      };
    }

    return {
      title: `《${contractName}》风险分析报告`,
      desc: "AI 风险分析摘要，仅供参考",
      path: `/pages/share/share?shareId=${shareId}`,
    };
  },
});
