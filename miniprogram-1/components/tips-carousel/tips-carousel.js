// components/tips-carousel/tips-carousel.js

const TIPS = require("../../data/tips");

Component({
  properties: {
    interval: {
      type: Number,
      value: 5000
    },
    title: {
      type: String,
      value: "您知道吗？"
    }
  },

  data: {
    index: 0,
    tip: ""
  },

  lifetimes: {
    attached() {
      if (!TIPS.length) return;

      // ✅ 随机起始（等价于 React randomStart）
      const start = Math.floor(Math.random() * TIPS.length);
      this.setData({
        index: start,
        tip: TIPS[start]
      });

      // ✅ 自动轮播
      this._timer = setInterval(() => {
        const next = (this.data.index + 1) % TIPS.length;
        this.setData({
          index: next,
          tip: TIPS[next]
        });
      }, this.properties.interval);
    },

    detached() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }
  }
});
