// pages/share/share.js
const { BASE_URL } = require("../../services/config");

Page({
  data: {
    loading: true,
    expired: false,
    error: "",

    score: 0,
    scoreTitle: "",
    riskSummary: "",
    expiresAt: "",
    contractName:"",
  },

  onLoad(options) {
    const { shareId } = options;
    if (!shareId) {
      this.setData({ loading: false, error: "无效的分享链接" });
      return;
    }
    this._fetchShare(shareId);
  },
  
  
  async _fetchShare(shareId) {
    try {
      const res = await this._request({
        url: `${BASE_URL}/v1/shares/${shareId}`,
        method: "GET",
      });

      this.setData({
        loading: false,
        score: res.score,
        scoreTitle: res.scoreTitle,
        riskSummary: res.riskSummary,
        expiresAt: res.expiresAt,
        contractName: res.contractName || "合同风险分析",
      });
      this._animateRingToScore(res.score);
    } catch (e) {
      const status = e?.statusCode;
      this.setData({
        loading: false,
        expired: status === 410,
        error:
          status === 410
            ? "该分享已过期"
            : "分享内容无法加载",
      });
    }
  },

  _request({ url, method }) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method,
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

  // 红->橙->绿（和 report 保持一致）
  _scoreToRingColor(score) {
    const s = Math.max(0, Math.min(100, Number(score) || 0));
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);

    const c1 = { r: 229, g: 72, b: 77 };   // red
    const c2 = { r: 245, g: 158, b: 11 };  // amber
    const c3 = { r: 34, g: 197, b: 94 };   // green

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

  // 把 "rgb(r,g,b)" 解析成 {r,g,b}
  _parseRgb(rgbStr) {
    const m = String(rgbStr).match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (!m) return { r: 245, g: 158, b: 11 };
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  },

  // 线性插值颜色：from -> to
  _lerpColor(fromRgb, toRgb, t) {
    const a = this._parseRgb(fromRgb);
    const b = this._parseRgb(toRgb);
    const lerp = (x, y, k) => Math.round(x + (y - x) * k);
    return `rgb(${lerp(a.r, b.r, t)},${lerp(a.g, b.g, t)},${lerp(a.b, b.b, t)})`;
  },

  // 画环（灰底 + 进度弧）
  _drawRing(ctx, w, h, progress01, color) {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.36; // 半径
    const lineW = Math.max(8, Math.floor(w * 0.05));

    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * progress01;

    ctx.clearRect(0, 0, w, h);

    // 灰色底环
    ctx.beginPath();
    ctx.setLineWidth(lineW);
    ctx.setStrokeStyle("rgba(255,255,255,0.18)");
    ctx.setLineCap("round");
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // 进度弧
    ctx.beginPath();
    ctx.setLineWidth(lineW);
    ctx.setStrokeStyle(color);
    ctx.setLineCap("round");
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
  },

  // 动画：灰色 -> 彩色，同时进度刷出来
  _animateRingToScore(score) {
    const target = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
    const targetColor = this._scoreToRingColor(score);

    // canvas 尺寸（用 rpx 转 px）
    const q = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const px = (rpx) => (q.windowWidth / 750) * rpx;

    const w = Math.floor(px(360));
    const h = Math.floor(px(360));

    const ctx = wx.createCanvasContext("scoreRing", this);

    const duration = 650; // ms
    const t0 = Date.now();

    const fromColor = "rgb(180,180,180)"; // 起始灰
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = () => {
      const t = (Date.now() - t0) / duration;
      const k = Math.max(0, Math.min(1, t));
      const e = easeOutCubic(k);

      // 进度从 0 -> target
      const p = target * e;

      // 颜色从灰 -> targetColor
      const c = this._lerpColor(fromColor, targetColor, e);

      this._drawRing(ctx, w, h, p, c);
      ctx.draw(false);

      if (k < 1) {
        // 继续下一帧
        this._ringTimer = setTimeout(tick, 16);
      } else {
        // 最终定格
        this.setData({ ringColor: targetColor });
      }
    };

    // 防止重复动画叠加
    if (this._ringTimer) clearTimeout(this._ringTimer);
    tick();
  },
  
  onUnload() {
    if (this._ringTimer) clearTimeout(this._ringTimer);
  },
  
  onCTA() {
    wx.switchTab({
      url: "/pages/home/home",
    });
  },
});
