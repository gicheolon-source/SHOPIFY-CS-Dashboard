// Shopify Admin GraphQL: 고객 이메일/주문번호로 주문 조회
// 인증: SHOPIFY_ADMIN_TOKEN(shpat_...) 또는 Dev Dashboard 앱의 SHOPIFY_CLIENT_ID/SECRET(client credentials)
const { HttpError } = require('./http');

const VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';
const env = (k) => (process.env[k] || '').trim();
const shop = () => env('SHOPIFY_STORE_DOMAIN').replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

function configured() {
  return !!(shop() && (process.env.SHOPIFY_ADMIN_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)));
}

let cached = null;
async function token() {
  if (env('SHOPIFY_ADMIN_TOKEN')) return env('SHOPIFY_ADMIN_TOKEN');
  if (cached && cached.exp > Date.now()) return cached.token;
  if (!shop().endsWith('.myshopify.com')) {
    throw new HttpError(502, `Shopify 인증 실패: SHOPIFY_STORE_DOMAIN은 xxx.myshopify.com 형식이어야 합니다 (현재: ${shop()})`);
  }
  const res = await fetch(`https://${shop()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env('SHOPIFY_CLIENT_ID'),
      client_secret: env('SHOPIFY_CLIENT_SECRET'),
    }),
    redirect: 'manual',
  });
  const raw = await res.text();
  let data = {};
  try { data = JSON.parse(raw); } catch {}
  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || (typeof data.errors === 'string' ? data.errors : '')
      || (res.status >= 300 && res.status < 400 ? `리디렉션됨 → ${res.headers.get('location')}` : raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200));
    console.error('shopify token failed', res.status, shop(), detail);
    throw new HttpError(502, `Shopify 인증 실패 (${res.status}, ${shop()}): ${detail || '응답 내용 없음'}`);
  }
  cached = { token: data.access_token, exp: Date.now() + ((data.expires_in || 3600) - 300) * 1000 };
  return cached.token;
}

async function gql(query, variables) {
  const res = await fetch(`https://${shop()}/admin/api/${VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': await token() },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors) {
    const msg = Array.isArray(data.errors) ? data.errors.map((e) => e.message).join('; ') : data.errors || res.status;
    throw new HttpError(502, `Shopify API 오류: ${msg}`);
  }
  return data.data;
}

const ORDERS_QUERY = `query CsOrders($q: String!) {
  orders(first: 10, query: $q, sortKey: CREATED_AT, reverse: true) {
    nodes {
      id legacyResourceId name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus note refundable
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id legacyResourceId displayName numberOfOrders amountSpent { amount currencyCode } }
      shippingAddress { firstName lastName company address1 address2 city provinceCode zip countryCodeV2 phone }
      lineItems(first: 10) { nodes { id title quantity currentQuantity sku } }
      fulfillments(first: 5) { displayStatus trackingInfo(first: 3) { company number url } }
      refunds(first: 5) { createdAt totalRefundedSet { shopMoney { amount currencyCode } } }
    }
  }
}`;

const money = (m) => (m ? `${Number(m.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${m.currencyCode}` : '');
const pretty = (s) => String(s || '').replace(/_/g, ' ').toLowerCase();

function adminUrl(path) {
  const handle = shop().replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${handle}/${path}`;
}

function shape(o) {
  const refunded = o.refunds.reduce((sum, r) => sum + Number(r.totalRefundedSet.shopMoney.amount), 0);
  const currency = o.totalPriceSet.shopMoney.currencyCode;
  return {
    id: o.id,
    name: o.name,
    url: adminUrl(`orders/${o.legacyResourceId}`),
    createdAt: o.createdAt,
    cancelled: !!o.cancelledAt,
    financial: pretty(o.displayFinancialStatus),
    fulfillment: pretty(o.displayFulfillmentStatus),
    total: money(o.totalPriceSet.shopMoney),
    refunded: refunded ? money({ amount: refunded, currencyCode: currency }) : '',
    refundable: !!o.refundable,
    currency,
    note: o.note || '',
    address: o.shippingAddress || null,
    items: o.lineItems.nodes.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, current: i.currentQuantity, sku: i.sku })),
    tracking: o.fulfillments.flatMap((f) => f.trackingInfo.map((t) => ({ ...t, status: pretty(f.displayStatus) }))),
    customer: o.customer ? {
      name: o.customer.displayName,
      orders: Number(o.customer.numberOfOrders),
      spent: money(o.customer.amountSpent),
      spentAmount: Number(o.customer.amountSpent?.amount || 0),
      currency: o.customer.amountSpent?.currencyCode || currency,
      url: adminUrl(`customers/${o.customer.legacyResourceId}`),
    } : null,
  };
}

async function lookup({ email, orderRefs = [] }) {
  if (process.env.DEMO_MODE === '1') return require('./demo').orders(email);
  if (!configured()) return { configured: false, orders: [] };
  const quote = (s) => `"${String(s).replace(/["\\]/g, '')}"`;
  const queries = [];
  if (email) queries.push(`email:${quote(email)}`);
  // 주문번호는 "DR#15409"처럼 접두사가 붙어 있을 수 있어 #번호 / 접두사#번호 둘 다 찾는다
  const prefix = (process.env.SHOPIFY_ORDER_PREFIX || 'DR').toUpperCase();
  for (const ref of orderRefs.slice(0, 3)) {
    const m = String(ref).match(/([A-Za-z]{0,5})#?(\d{4,9})/);
    if (!m) continue;
    const names = new Set([`#${m[2]}`, `${prefix}#${m[2]}`, ...(m[1] ? [`${m[1].toUpperCase()}#${m[2]}`] : [])]);
    queries.push([...names].map((n) => `name:${quote(n)}`).join(' OR '));
  }
  const results = await Promise.all(queries.map((q) => gql(ORDERS_QUERY, { q })));
  const seen = new Map();
  for (const r of results) for (const o of r.orders.nodes) seen.set(o.id, shape(o));
  const orders = [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { configured: true, orders, customer: orders.find((o) => o.customer)?.customer || null };
}

// ---------- 주문 처리 (대시보드 버튼) ----------
// 모두 실제 주문을 바꾸므로 화면에서 한 번 더 확인한 뒤에만 부른다.
const CANCEL_REASONS = ['CUSTOMER', 'DECLINED', 'FRAUD', 'INVENTORY', 'OTHER', 'STAFF'];
const demoMode = () => process.env.DEMO_MODE === '1';

function userErrors(errors, what) {
  const list = (errors || []).filter(Boolean);
  if (list.length) throw new HttpError(400, `${what} 실패: ${list.map((e) => e.message).join(' / ')}`);
}

async function cancelOrder(orderId, { reason = 'CUSTOMER', refund = true, restock = true, notify = false, staffNote = '' } = {}) {
  if (!CANCEL_REASONS.includes(reason)) throw new HttpError(400, '취소 사유가 올바르지 않습니다');
  if (demoMode()) return { ok: true };
  const data = await gql(`mutation CsCancel($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!, $notifyCustomer: Boolean, $refundMethod: OrderCancelRefundMethodInput, $staffNote: String) {
    orderCancel(orderId: $orderId, reason: $reason, restock: $restock, notifyCustomer: $notifyCustomer, refundMethod: $refundMethod, staffNote: $staffNote) {
      job { id done }
      orderCancelUserErrors { field message code }
    }
  }`, {
    orderId,
    reason,
    restock: !!restock,
    notifyCustomer: !!notify,
    refundMethod: refund ? { originalPaymentMethodsRefund: true } : null,
    staffNote: String(staffNote || '').slice(0, 255) || null,
  });
  userErrors(data.orderCancel.orderCancelUserErrors, '주문 취소');
  return { ok: true, job: data.orderCancel.job };
}

const ADDRESS_FIELDS = ['firstName', 'lastName', 'company', 'address1', 'address2', 'city', 'provinceCode', 'zip', 'countryCode', 'phone'];
async function updateAddress(orderId, address) {
  const input = {};
  for (const k of ADDRESS_FIELDS) if (address?.[k] != null) input[k] = String(address[k]).trim().slice(0, 255);
  if (!input.address1 || !input.city || !input.countryCode) throw new HttpError(400, '주소1·도시·국가 코드는 꼭 입력해 주세요');
  if (demoMode()) return { ok: true };
  const data = await gql(`mutation CsAddress($input: OrderInput!) {
    orderUpdate(input: $input) { order { id } userErrors { field message } }
  }`, { input: { id: orderId, shippingAddress: input } });
  userErrors(data.orderUpdate.userErrors, '배송지 변경');
  return { ok: true };
}

// 주문 메모(관리자 화면 Notes)에 한 줄 덧붙인다 — 기존 메모는 그대로 둔다
async function addNote(orderId, line) {
  const text = String(line || '').trim().slice(0, 1000);
  if (!text) throw new HttpError(400, '메모 내용이 비어 있습니다');
  if (demoMode()) return { ok: true };
  const cur = await gql('query CsNote($id: ID!) { order(id: $id) { note } }', { id: orderId });
  const note = [cur.order?.note, text].filter(Boolean).join('\n').slice(-5000);
  const data = await gql(`mutation CsNoteUpdate($input: OrderInput!) {
    orderUpdate(input: $input) { order { id } userErrors { field message } }
  }`, { input: { id: orderId, note } });
  userErrors(data.orderUpdate.userErrors, '주문 메모');
  return { ok: true };
}

// 환불: full=true면 Shopify가 계산한 전액(상품+배송), 아니면 amount만큼 원결제 수단으로
async function refundOrder(orderId, { full = true, amount, note = '', notify = false, key }) {
  if (demoMode()) return { ok: true, amount: full ? 'full' : amount };
  const s = await gql(`query CsSuggest($id: ID!) {
    order(id: $id) {
      refundable
      suggestedRefund(suggestFullRefund: true, refundShipping: true) {
        amountSet { shopMoney { amount currencyCode } }
        refundLineItems { lineItem { id } quantity }
        suggestedTransactions { amountSet { shopMoney { amount } } maximumRefundableSet { shopMoney { amount } } gateway parentTransaction { id } }
      }
    }
  }`, { id: orderId });
  const sug = s.order?.suggestedRefund;
  if (!s.order?.refundable || !sug || !sug.suggestedTransactions.length) throw new HttpError(400, '이 주문은 환불할 수 있는 결제 내역이 없습니다');
  const max = Number(sug.amountSet.shopMoney.amount);
  const currency = sug.amountSet.shopMoney.currencyCode;
  let input;
  if (full) {
    input = {
      orderId,
      notify: !!notify,
      note: note || null,
      refundLineItems: sug.refundLineItems.map((r) => ({ lineItemId: r.lineItem.id, quantity: r.quantity, restockType: 'NO_RESTOCK' })),
      shipping: { fullRefund: true },
      transactions: sug.suggestedTransactions.map((t) => ({
        orderId, parentId: t.parentTransaction?.id, gateway: t.gateway, kind: 'REFUND', amount: t.amountSet.shopMoney.amount,
      })),
    };
  } else {
    const want = Math.round(Number(amount) * 100) / 100;
    if (!(want > 0)) throw new HttpError(400, '환불 금액을 입력해 주세요');
    if (want > max) throw new HttpError(400, `환불 가능 금액(${max} ${currency})보다 큽니다`);
    const tx = sug.suggestedTransactions.find((t) => Number(t.maximumRefundableSet?.shopMoney.amount ?? t.amountSet.shopMoney.amount) >= want) || sug.suggestedTransactions[0];
    input = {
      orderId,
      notify: !!notify,
      note: note || null,
      transactions: [{ orderId, parentId: tx.parentTransaction?.id, gateway: tx.gateway, kind: 'REFUND', amount: String(want) }],
    };
  }
  const idem = String(key || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64) || require('crypto').randomUUID();
  const data = await gql(`mutation CsRefund($input: RefundInput!) {
    refundCreate(input: $input) @idempotent(key: "${idem}") {
      refund { id totalRefundedSet { shopMoney { amount currencyCode } } }
      userErrors { field message }
    }
  }`, { input });
  userErrors(data.refundCreate.userErrors, '환불');
  const done = data.refundCreate.refund?.totalRefundedSet?.shopMoney;
  return { ok: true, amount: done ? money(done) : '' };
}

module.exports = { configured, lookup, cancelOrder, updateAddress, addNote, refundOrder, CANCEL_REASONS };
