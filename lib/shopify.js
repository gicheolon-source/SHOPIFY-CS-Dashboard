// Shopify Admin GraphQL: 고객 이메일/주문번호로 주문 조회
// 인증: SHOPIFY_ADMIN_TOKEN(shpat_...) 또는 Dev Dashboard 앱의 SHOPIFY_CLIENT_ID/SECRET(client credentials)
const { HttpError } = require('./http');

const VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';
const shop = () => (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

function configured() {
  return !!(shop() && (process.env.SHOPIFY_ADMIN_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET)));
}

let cached = null;
async function token() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (cached && cached.exp > Date.now()) return cached.token;
  const res = await fetch(`https://${shop()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new HttpError(502, `Shopify 인증 실패: ${data.error_description || data.error || res.status}`);
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
      id legacyResourceId name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id legacyResourceId displayName numberOfOrders amountSpent { amount currencyCode } }
      lineItems(first: 10) { nodes { title quantity sku } }
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
    items: o.lineItems.nodes.map((i) => ({ title: i.title, quantity: i.quantity, sku: i.sku })),
    tracking: o.fulfillments.flatMap((f) => f.trackingInfo.map((t) => ({ ...t, status: pretty(f.displayStatus) }))),
    customer: o.customer ? {
      name: o.customer.displayName,
      orders: Number(o.customer.numberOfOrders),
      spent: money(o.customer.amountSpent),
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
  for (const ref of orderRefs.slice(0, 3)) queries.push(`name:${quote(ref.startsWith('#') ? ref : `#${ref}`)}`);
  const results = await Promise.all(queries.map((q) => gql(ORDERS_QUERY, { q })));
  const seen = new Map();
  for (const r of results) for (const o of r.orders.nodes) seen.set(o.id, shape(o));
  const orders = [...seen.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { configured: true, orders, customer: orders.find((o) => o.customer)?.customer || null };
}

module.exports = { configured, lookup };
