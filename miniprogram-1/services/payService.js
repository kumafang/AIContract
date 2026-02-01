// services/payService.js
const { request } = require("./request");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 创建预支付单，拿到小程序 requestPayment 参数
 * @param {string} skuId e.g. CREDIT_10
 */
async function prepay(skuId) {
  return request({
    url: "/v1/pay/prepay",
    method: "POST",
    data: { sku_id: skuId },
  });
}

/**
 * 查询订单状态（后端会在这里做微信查单 + 入账幂等）
 * @param {string} outTradeNo
 */
async function getOrder(outTradeNo) {
  return request({
    url: `/v1/pay/orders/${encodeURIComponent(outTradeNo)}`,
    method: "GET",
  });
}

/**
 * 轻量确认：最多尝试 N 次，不阻塞主流程（可用于补偿）
 * - 返回最后一次订单对象（可能未 PAID）
 */
async function tryConfirmPaid(outTradeNo, opts = {}) {
  const { tries = 3, intervalMs = 900 } = opts;

  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      last = await getOrder(outTradeNo);
      if (last && last.status === "PAID") return last;
    } catch (e) {
      // 忽略：网络抖动不影响体验
    }
    await sleep(intervalMs);
  }
  return last;
}

async function listOrders(limit = 20) {
  return request({
    url: `/v1/pay/orders?limit=${encodeURIComponent(limit)}`,
    method: "GET",
  });
}

module.exports = { prepay, getOrder, tryConfirmPaid, listOrders };
