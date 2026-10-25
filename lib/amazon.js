// 아마존 MCF(Multi-Channel Fulfillment) 배송 조회 — 읽기 전용. MCF 주문을 만들거나 취소하지 않는다.
// 인증: 아마존 대시보드와 같은 SP-API LWA 앱 (SP_CLIENT_ID / SP_CLIENT_SECRET / SP_REFRESH_TOKEN, 북미 엔드포인트)
// · 자사몰 주문 출고: MCF 주문 ID = Shopify 주문 ID(legacyResourceId) → 정확히 매칭
// · CS 재발송: 'SHOPIFY CS Sample_032'처럼 주문과 안 이어진 ID → 받는 사람 이름으로 "추정 매칭"
const { readJSON, writeJSON } = require('./store');

const ENDPOINT = process.env.SP_ENDPOINT || 'https://sellingpartnerapi-na.amazon.com';
const BASE = '/fba/outbound/2020-07-01/fulfillmentOrders';
const INDEX_PATH = 'cs/mcf-index.json';
const INDEX_TTL = 30 * 60_000; // 재발송 후보 목록은 30분마다 새로 받는다
const INDEX_DAYS = 60;

// 아마존 대시보드(amazon-hub) 쪽 이름(LWA_CLIENT_ID 등)으로 넣어도 읽는다
const env = (...keys) => keys.map((k) => (process.env[k] || '').trim()).find(Boolean) || '';
const CLIENT_ID = () => env('SP_CLIENT_ID', 'LWA_CLIENT_ID');
const CLIENT_SECRET = () => env('SP_CLIENT_SECRET', 'LWA_CLIENT_SECRET');
const REFRESH_TOKEN = () => env('SP_REFRESH_TOKEN', 'SPAPI_REFRESH_TOKEN');
const configured = () => !!(CLIENT_ID() && CLIENT_SECRET() && REFRESH_TOKEN());
const demo = () => process.env.DEMO_MODE === '1';

let cached = null;
async function token() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const res = await fetch('https://api.amazon.com/auth/o2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN(),
      client_id: CLIENT_ID(),
      client_secret: CLIENT_SECRET(),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`아마존 인증 실패: ${data.error_description || data.error || res.status}`);
  cached = { token: data.access_token, exp: Date.now() + ((data.expires_in || 3600) - 120) * 1000 };
  return cached.token;
}

// GET만 쓴다. 429(호출 제한)면 잠깐 쉬고 한 번 더.
async function get(path, retry = 2) {
  const res = await fetch(`${ENDPOINT}${path}`, { headers: { 'x-amz-access-token': await token(), Accept: 'application/json' } });
  if (res.status === 429 && retry > 0) {
    await new Promise((r) => setTimeout(r, 1200));
    return get(path, retry - 1);
  }
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.errors?.map((e) => e.message).join('; ') || res.status;
    console.error('sp-api error', res.status, path.split('?')[0], msg);
    throw new Error(`아마존 MCF 조회 오류: ${msg}`);
  }
  return data.payload || data;
}

// MCF 주문 상세 → 화면·AI용으로 정리
function shape(d) {
  const o = d.fulfillmentOrder;
  return {
    id: o.sellerFulfillmentOrderId,
    status: o.fulfillmentOrderStatus,
    received: o.receivedDate,
    statusUpdated: o.statusUpdatedDate,
    name: o.destinationAddress?.name || '',
    city: [o.destinationAddress?.city, o.destinationAddress?.stateOrRegion].filter(Boolean).join(', '),
    speed: o.shippingSpeedCategory,
    items: (d.fulfillmentOrderItems || []).map((i) => ({ sku: i.sellerSku, qty: i.quantity, cancelled: i.cancelledQuantity, unfulfillable: i.unfulfillableQuantity })),
    shipments: (d.fulfillmentShipments || []).map((s) => ({
      status: s.fulfillmentShipmentStatus,
      shippedAt: s.shippingDate,
      eta: s.estimatedArrivalDate,
      packages: (s.fulfillmentShipmentPackage || []).map((p) => ({
        carrier: p.carrierCode, tracking: p.trackingNumber, eta: p.estimatedArrivalDate,
        delivery: p.deliveryInformation?.deliveryDocumentList ? 'delivered' : p.deliveryInformation ? 'info' : '',
      })),
    })),
  };
}

async function order(id) {
  const d = await get(`${BASE}/${encodeURIComponent(id)}`);
  return d?.fulfillmentOrder ? shape(d) : null;
}

// 주문과 안 이어진 MCF 주문(CS 재발송 등) 목록 — Blob에 캐시.
// 처음엔 60일치를 다 훑고(약 20초), 그 뒤로는 지난번 이후 바뀐 주문만 받아 합친다(수 초).
async function manualIndex() {
  const { data } = await readJSON(INDEX_PATH, null);
  if (data && Date.now() - data.at < INDEX_TTL) return data.orders;
  const full = !data;
  // queryStartDate = 이 시각 이후 '갱신된' MCF 주문
  const since = new Date(full ? Date.now() - INDEX_DAYS * 86400_000 : data.at - 2 * 3600_000).toISOString();
  const byId = new Map((full ? [] : data.orders).map((o) => [o.id, o]));
  let next = null;
  for (let page = 0; page < 40; page++) {
    const p = await get(`${BASE}?${next ? `nextToken=${encodeURIComponent(next)}` : `queryStartDate=${encodeURIComponent(since)}`}`);
    for (const o of p?.fulfillmentOrders || []) {
      if (/^\d{10,}$/.test(o.sellerFulfillmentOrderId)) continue; // 자사몰 자동 출고는 주문 ID로 바로 찾으니 제외
      byId.set(o.sellerFulfillmentOrderId, { id: o.sellerFulfillmentOrderId, name: o.destinationAddress?.name || '', status: o.fulfillmentOrderStatus, received: o.receivedDate });
    }
    next = p?.nextToken;
    if (!next) break;
  }
  const cutoff = Date.now() - INDEX_DAYS * 86400_000;
  const orders = [...byId.values()].filter((o) => Date.parse(o.received) >= cutoff);
  await writeJSON(INDEX_PATH, { at: Date.now(), orders }).catch(() => {});
  return orders;
}

// 매일 아침 크론에서 미리 갱신해 두면 낮에 처음 여는 사람이 기다리지 않는다
async function refreshIndex() {
  if (!configured() || demo()) return;
  await manualIndex();
}

// 이름 비교: 소문자·영문/한글만, 짧은 쪽 이름의 단어가 긴 쪽에 다 들어 있으면 같은 사람으로 본다
const words = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z가-힣\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
function sameName(a, b) {
  const x = words(a);
  const y = words(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= (long.length > 1 ? 2 : 1) ? short.every((w) => long.includes(w)) : false;
}

// 티켓 하나의 MCF 배송: 자사몰 주문 출고(정확) + 이름으로 찾은 재발송(추정)
async function lookup({ orders = [], names = [], since }) {
  if (demo()) return require('./demo').mcf();
  if (!configured()) return { configured: false, originals: [], reships: [] };
  const originals = (await Promise.all(orders.slice(0, 3).filter((o) => o.legacyId).map(async (o) => {
    const m = await order(o.legacyId).catch(() => null);
    return m ? { ...m, shopifyOrder: o.name } : null;
  }))).filter(Boolean);
  const nameList = [...new Set(names.filter(Boolean))];
  const after = since ? since - 3 * 86400_000 : 0;
  const index = nameList.length ? await manualIndex() : [];
  const candidates = index
    .filter((m) => nameList.some((n) => sameName(n, m.name)) && (!after || Date.parse(m.received) >= after))
    .sort((a, b) => Date.parse(b.received) - Date.parse(a.received))
    .slice(0, 3);
  const reships = (await Promise.all(candidates.map((m) => order(m.id).catch(() => null)))).filter(Boolean).map((m) => ({ ...m, guessed: true }));
  return { configured: true, originals, reships };
}

// 티켓 → MCF 조회 조건: Shopify 주문(출고 정확 매칭) + 고객 이름들(재발송 추정 매칭) + 첫 주문·문의 무렵 이후
function queryFor(ticket, shop = {}) {
  const orders = shop.orders || [];
  const names = [ticket.customer?.name, ticket.form?.name, shop.customer?.name,
    ...orders.map((o) => [o.address?.firstName, o.address?.lastName].filter(Boolean).join(' '))];
  const since = Math.min(ticket.firstAt || Date.now(), ...orders.slice(0, 3).map((o) => Date.parse(o.createdAt) || Date.now()));
  return { orders, names, since };
}

// AI 답장·검수용 요약 글
function context(m) {
  if (!m || !m.configured) return '조회 안 됨';
  const day = (v) => (v ? String(v).slice(0, 10) : '?');
  const line = (o, label) => {
    const head = `- ${label} MCF ${o.id} (${o.status}, 접수 ${day(o.received)}${o.shopifyOrder ? `, Shopify ${o.shopifyOrder}` : ''}${o.guessed ? ', 받는 사람 이름으로 추정 매칭' : ''})`;
    const items = o.items.map((i) => `${i.sku} x${i.qty}`).join(', ');
    const ships = o.shipments.map((s) => ` / 출고 ${day(s.shippedAt)} ${s.status} 예상도착 ${day(s.eta)} ${s.packages.map((p) => `${p.carrier} ${p.tracking || ''}`).join(', ')}`).join('');
    return `${head} 품목: ${items}${ships}`;
  };
  const lines = [...m.originals.map((o) => line(o, '원 주문 출고')), ...m.reships.map((o) => line(o, 'CS 재발송'))];
  return lines.length ? lines.join('\n') : 'MCF 기록 없음';
}

module.exports = { configured, lookup, queryFor, context, refreshIndex, sameName };
