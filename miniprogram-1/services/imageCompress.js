// services/imageCompress.js
// Canvas 2D resize + quality compress for WeChat Mini Program
// Usage: const { compressImagePaths } = require("../../services/imageCompress");

function getCanvasNode(page, canvasId = "#compressCanvas") {
  return new Promise((resolve, reject) => {
    const q = wx.createSelectorQuery().in(page);
    q.select(canvasId)
      .node()
      .exec((res) => {
        const node = res && res[0] && res[0].node;
        if (!node) return reject(new Error("compressCanvas node not found"));
        resolve(node);
      });
  });
}

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src,
      success: resolve,
      fail: reject,
    });
  });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function calcTargetSize(w, h, maxSide) {
  const longSide = Math.max(w, h);
  if (longSide <= maxSide) return { tw: w, th: h, scale: 1 };

  const scale = maxSide / longSide;
  return {
    tw: Math.round(w * scale),
    th: Math.round(h * scale),
    scale,
  };
}

async function compressOneWithCanvas(page, srcPath, opts = {}) {
  const {
    maxSide = 2000,
    quality = 0.75, // 0~1
    fileType = "jpg", // 'jpg' | 'png'  (webp 在 toTempFilePath 里各版本支持不一致，先 jpg 最稳)
    canvasSelector = "#compressCanvas",
  } = opts;

  const info = await getImageInfo(srcPath);
  const w = info.width;
  const h = info.height;

  const { tw, th, scale } = calcTargetSize(w, h, maxSide);

  // 如果不需要缩放且你仍想强制压缩质量：也可以走一次 canvas（这里默认走）
  const canvas = await getCanvasNode(page, canvasSelector);
  const ctx = canvas.getContext("2d");

  canvas.width = tw;
  canvas.height = th;

  // 2d canvas in mini program: use createImage()
  const img = canvas.createImage();
  const imgLoad = new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
  });
  img.src = srcPath;
  await imgLoad;

  // 清空并绘制
  ctx.clearRect(0, 0, tw, th);
  ctx.drawImage(img, 0, 0, tw, th);

  // 输出 temp file
  const q = clamp(quality, 0.1, 1);
  const out = await new Promise((resolve, reject) => {
    // node canvas API
    canvas.toTempFilePath({
      x: 0,
      y: 0,
      width: tw,
      height: th,
      destWidth: tw,
      destHeight: th,
      fileType, // 'jpg' or 'png'
      quality: q,
      success: resolve,
      fail: reject,
    });
  });
  
  console.log("[compress]", { srcPath, w, h, tw, th, scale });

  return {
    src: srcPath,
    outPath: out.tempFilePath,
    width: tw,
    height: th,
    scale,
    originalWidth: w,
    originalHeight: h,
  };
}

/**
 * Compress multiple images sequentially to avoid memory spikes.
 * @param {Page} page - current page instance (this)
 * @param {string[]} paths - tempFilePaths from chooseImage
 * @param {object} opts
 * @returns {Promise<string[]>} compressed tempFilePaths
 */
async function compressImagePaths(page, paths = [], opts = {}) {
  const results = [];
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    try {
      const r = await compressOneWithCanvas(page, p, opts);
      results.push(r.outPath);
    } catch (e) {
      // 压缩失败：兜底返回原图，避免阻塞用户
      results.push(p);
    }
  }
  return results;
}

module.exports = {
  compressImagePaths,
};
