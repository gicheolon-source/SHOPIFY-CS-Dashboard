// 팀 공용 기록: CS 비용(환불·재발송·배송비 환불 등)과 블랙리스트(주의 고객). Blob에 저장.
const { readJSON, updateJSON } = require('./store');

const COSTS_PATH = 'cs/costs.json';
const BLACKLIST_PATH = 'cs/blacklist.json';

const COST_KINDS = { refund: '환불', cancel: '취소 환불', reship: '재발송', shipping: '배송비 환불', compensation: '보상', other: '기타' };

// "68.00 USD" 같은 문자열이나 숫자 → 숫자
const toAmount = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

async function addCost({ kind, amount, currency = 'USD', order = '', ticketId = '', products = [], by, note = '' }) {
  if (!COST_KINDS[kind]) throw new Error('비용 종류가 올바르지 않습니다');
  const value = toAmount(amount);
  if (!(value > 0)) throw new Error('금액을 입력해 주세요');
  const entry = {
    at: Date.now(), kind, amount: value, currency: String(currency || 'USD').slice(0, 3).toUpperCase(),
    order: String(order).slice(0, 40), ticketId: String(ticketId).slice(0, 40),
    products: (products || []).map(String).slice(0, 10), by, note: String(note || '').slice(0, 300),
  };
  await updateJSON(COSTS_PATH, { items: [] }, (data) => ({ items: [entry, ...(data.items || [])].slice(0, 5000) }));
  return entry;
}

// 기간 안의 비용: 종류별·월별·제품별 합계 (통화가 섞이면 통화별로 따로)
async function costSummary(days) {
  const { data } = await readJSON(COSTS_PATH, { items: [] });
  const since = Date.now() - days * 86400_000;
  const items = (data.items || []).filter((x) => x.at >= since);
  const add = (map, key, x) => {
    map[key] = map[key] || {};
    map[key][x.currency] = Math.round(((map[key][x.currency] || 0) + x.amount) * 100) / 100;
  };
  const total = {};
  const byKind = {};
  const byMonth = {};
  const byProduct = {};
  for (const x of items) {
    total[x.currency] = Math.round(((total[x.currency] || 0) + x.amount) * 100) / 100;
    add(byKind, COST_KINDS[x.kind] || x.kind, x);
    add(byMonth, new Date(x.at + 9 * 3600_000).toISOString().slice(0, 7), x);
    // 상품이 여러 개면 금액을 나눠 싣지 않고 각 상품에 "관련 건수"로만 센다
    for (const p of x.products.length ? x.products : ['(제품 미지정)']) {
      byProduct[p] = byProduct[p] || { count: 0, amount: {} };
      byProduct[p].count++;
      if (x.products.length <= 1) byProduct[p].amount[x.currency] = Math.round(((byProduct[p].amount[x.currency] || 0) + x.amount) * 100) / 100;
    }
  }
  return {
    days, count: items.length, total, byKind, byMonth,
    byProduct: Object.entries(byProduct).map(([product, v]) => ({ product, ...v })).sort((a, b) => b.count - a.count).slice(0, 12),
    recent: items.slice(0, 15).map((x) => ({ ...x, kindLabel: COST_KINDS[x.kind] || x.kind })),
  };
}

// ---------- 블랙리스트 ----------
async function readBlacklist() {
  const { data } = await readJSON(BLACKLIST_PATH, { customers: {} });
  return data.customers || {};
}

async function setBlacklist(email, entry) {
  const key = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new Error('이메일이 올바르지 않습니다');
  let customers = {};
  await updateJSON(BLACKLIST_PATH, { customers: {} }, (data) => {
    customers = { ...(data.customers || {}) };
    if (entry) customers[key] = { reason: String(entry.reason || '').slice(0, 300), by: entry.by, at: Date.now() };
    else delete customers[key];
    return { customers };
  });
  return customers;
}

module.exports = { COST_KINDS, toAmount, addCost, costSummary, readBlacklist, setBlacklist };
