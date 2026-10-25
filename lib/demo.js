// 로컬 화면 확인용 가짜 데이터 (DEMO_MODE=1). 실제 Gmail/Shopify를 건드리지 않는다.
const US = { name: 'Dr.Reju-All Care', email: 'global_md@drrejuall.com' };
const H = 3600_000;
const now = Date.now();

const raw = [
  ['t1', 'Emily Carter', 'emily.carter@example.com', 'Where is my order #10482?', [
    [-30, 'c', 'Hi, I ordered the PDRN cream two weeks ago (order #10482) and the tracking has not updated since it left Korea. Can you check what is going on? I need it before my trip next week.'],
  ]],
  ['t2', 'Marco Rossi', 'marco.rossi@example.com', 'Refund request - wrong item received', [
    [-52, 'c', 'Hello, I received the Ceramide serum instead of the Retino Melasma cream I ordered (#10455). I would like a refund or the correct item please.'],
    [-40, 'u', 'Hi Marco, we are so sorry about the mix-up. Could you send a photo of the item you received?'],
    [-6, 'c', 'Here is the photo. Please let me know how you want to proceed.'],
  ]],
  ['t3', 'Sarah Kim', 'sarah.kim@example.com', 'Skin reaction after using PDRN serum', [
    [-3, 'c', 'I started using the PDRN serum 3 days ago and now my cheeks are red and itchy. Is this normal? Should I stop using it? This is really urgent, I have an event on Saturday.'],
  ]],
  ['t4', 'Glow Studio (Jess)', 'jess@glowstudio.example', 'Collaboration inquiry - 450K TikTok', [
    [-20, 'c', 'Hi Dr.Reju-All team! I run a skincare TikTok with 450K followers and would love to collaborate on a PDRN routine video. Do you have an influencer program?'],
  ]],
  ['t5', 'Ahmed Hassan', 'ahmed.h@example.com', 'Wholesale pricing for UAE distribution', [
    [-75, 'c', 'We are a beauty distributor in Dubai interested in carrying Dr.Reju-All. Could you share wholesale pricing and MOQ?'],
    [-50, 'u', 'Thank you for your interest. Our B2B team will reach out with the price list shortly.'],
  ]],
  ['t6', 'Linda Nguyen', 'linda.ng@example.com', 'Discount code not working at checkout', [
    [-9, 'c', 'The code WELCOME15 from your email does not apply at checkout. It says invalid. Can you help? I want to place the order today.'],
  ]],
  ['t7', 'Tom Becker', 'tom.becker@example.com', 'How to layer the Retino cream with vitamin C?', [
    [-100, 'c', 'Can I use the Retino Melasma cream in the same routine as my vitamin C serum? Morning or night?'],
    [-90, 'u', 'Great question! We recommend vitamin C in the morning and the Retino cream at night.'],
  ]],
  ['t8', '민지 박', 'minji.park@example.com', '배송지 변경 요청드립니다', [
    [-2, 'c', '안녕하세요, 어제 주문한 건(#10511) 배송지를 회사 주소로 바꾸고 싶어요. 아직 출고 전이면 변경 가능할까요?'],
  ]],
  ['t9', 'Chargeback Alerts', 'disputes@example-payments.com', 'Dispute opened for order #10397', [
    [-14, 'c', 'A chargeback has been opened by the cardholder for order #10397 (USD 64.00). Reason: product not received. Please respond within 7 days.'],
  ]],
  ['t11', 'Rachel Moore', 'rachel.moore@example.com', 'Is this PDRN cream authentic?', [
    [-11, 'c', 'I bought your PDRN cream from a third-party seller and the box looks different from your website photos. How can I check if it is genuine and not counterfeit?'],
  ]],
  ['t12', 'Google', 'no-reply@accounts.google.com', '보안 알림', [
    [-5, 'c', 'Windows 기기에서 새로 로그인했습니다. 본인이 아니라면 계정을 확인하세요.'],
  ]],
  ['t10', 'SEO Growth Agency', 'hello@seo-growth.example', 'Boost your store traffic 10x', [
    [-26, 'c', 'Hi there, we noticed your Shopify store could rank higher on Google. Book a free call with our SEO experts today!'],
  ]],
  // Shopify 문의 폼: 발신자는 mailer@shopify.com, 실제 고객은 Reply-To
  ['t13', 'Dr.Reju-All Official Store (Shopify)', 'mailer@shopify.com', 'New customer message on October 24, 2026 at 3:12 pm', [
    [-8, 'c', "You received a new message from your online store's contact form.\nCountry Code: US\nName: Olivia Park\nEmail: olivia.park@example.com\nPhone Number:\nComment: Hi, I bought the PDRN serum on Amazon (order 113-4567890-1234567) and it arrived leaking. Can you send a replacement?"],
  ], { name: 'olivia.park', email: 'olivia.park@example.com' }],
];

const threads = new Map();
for (const [id, name, email, subject, msgs, replyTo = null] of raw) {
  const customer = { name, email };
  threads.set(id, {
    id,
    messages: msgs.map(([h, who, text], i) => ({
      id: `${id}-m${i}`,
      at: now + h * H,
      from: who === 'c' ? customer : US,
      to: [who === 'c' ? US : customer],
      cc: [],
      replyTo: who === 'c' ? replyTo : null,
      subject: i === 0 ? subject : `Re: ${subject}`,
      labelIds: who === 'c' && i === msgs.length - 1 ? ['INBOX', 'UNREAD'] : ['INBOX'],
      snippet: text.slice(0, 140),
      messageId: `<${id}-m${i}@demo>`,
      references: '',
      text,
      quoted: '',
      attachments: i === 2 && id === 't2' ? [{ name: 'photo.png', size: 482113, mime: 'image/png', attachmentId: 'demo-a1' }] : [],
    })),
  });
}

function listThreadIds() {
  return [...threads.keys()];
}

function threadMeta(id) {
  const t = threads.get(id);
  return { id, messages: t.messages.map(({ text, quoted, ...m }) => m) };
}

function threadFull(id) {
  const t = threads.get(id);
  if (!t) throw Object.assign(new Error('없는 스레드'), { status: 404, expose: true });
  return structuredClone(t);
}

// 데모 첨부: 작은 회색 PNG
function attachment() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mO8/x8AAusB9Wn6R0YAAAAASUVORK5CYII=', 'base64');
}

function listSent() {
  return [...threads.values()]
    .flatMap((t) => t.messages.filter((m) => m.from.email === US.email).map(({ text, quoted, ...m }) => ({ ...m, threadId: t.id })))
    .sort((a, b) => b.at - a.at);
}

function reply({ threadId, mode, text }) {
  if (mode === 'send') {
    const t = threads.get(threadId);
    const first = t.messages[0];
    const id = `${threadId}-m${t.messages.length}`;
    t.messages.push({
      ...first,
      id,
      at: Date.now(),
      from: US,
      to: [first.from],
      subject: `Re: ${first.subject.replace(/^re:\s*/i, '')}`,
      labelIds: ['SENT'],
      snippet: text.slice(0, 140),
      text,
      attachments: [],
    });
    return { id, mode };
  }
  return { id: `demo-${Date.now()}`, mode };
}

function orders(email) {
  if (!email || email.includes('agency') || email.includes('glowstudio')) return { configured: true, orders: [] };
  const n = 10400 + (email.length * 7) % 120;
  const customer = { name: email.split('@')[0], orders: 3, spent: '182.50 USD', spentAmount: 182.5, currency: 'USD', url: '#' };
  const address = { firstName: email.split('@')[0], lastName: '', company: '', address1: '12 Oak St', address2: '', city: 'Austin', provinceCode: 'TX', zip: '78701', countryCodeV2: 'US', phone: '' };
  return {
    configured: true,
    customer,
    orders: [
      {
        id: 'gid://shopify/Order/9001', name: `DR#${n}`, url: '#', createdAt: new Date(now - 13 * 24 * H).toISOString(), cancelled: false,
        financial: 'paid', fulfillment: 'fulfilled', total: '68.00 USD', refunded: '', refundable: true, currency: 'USD', note: '', address,
        items: [{ id: 'gid://shopify/LineItem/1', title: 'PDRN Rejuvenating Cream 50ml', quantity: 1, current: 1, sku: 'PD3_50' }, { id: 'gid://shopify/LineItem/2', title: 'Ceramide Barrier Serum', quantity: 1, current: 1, sku: 'SD4_30' }],
        tracking: [{ company: 'DHL Express', number: '1234567890', url: 'https://www.dhl.com/track?id=1234567890', status: 'in transit' }],
        customer,
      },
      {
        id: 'gid://shopify/Order/9002', name: `DR#${n - 61}`, url: '#', createdAt: new Date(now - 70 * 24 * H).toISOString(), cancelled: false,
        financial: 'paid', fulfillment: 'fulfilled', total: '45.00 USD', refunded: '', refundable: true, currency: 'USD', note: '', address,
        items: [{ id: 'gid://shopify/LineItem/3', title: 'Retino Melasma Cream 30ml', quantity: 1, current: 1, sku: 'EP2_30' }],
        tracking: [{ company: 'USPS', number: '9400100000000000000000', url: '', status: 'delivered' }],
        customer,
      },
    ],
  };
}

// 데모 아마존 MCF: 원 주문 출고 1건 + 이름으로 찾은 CS 재발송 1건
function mcf() {
  const d = (h) => new Date(now + h * H).toISOString();
  return {
    configured: true,
    originals: [{
      id: '9001', shopifyOrder: 'DR#10448', status: 'Complete', received: d(-13 * 24), name: 'Emily Carter', city: 'Austin, TX', speed: 'Standard',
      items: [{ sku: 'PD3_50', qty: 1 }, { sku: 'SD4_30', qty: 1 }],
      shipments: [{ status: 'SHIPPED', shippedAt: d(-12 * 24), eta: d(-9 * 24), packages: [{ carrier: 'Amazon Logistics', tracking: 'TBA318204417000', eta: d(-9 * 24) }] }],
    }],
    reships: [{
      id: 'SHOPIFY CS Sample_041', guessed: true, status: 'Processing', received: d(-20), name: 'Emily Carter', city: 'Austin, TX', speed: 'Expedited',
      items: [{ sku: 'PD3_50', qty: 1 }],
      shipments: [{ status: 'PENDING', shippedAt: null, eta: d(48), packages: [] }],
    }],
  };
}

module.exports = { listThreadIds, threadMeta, threadFull, listSent, attachment, reply, orders, mcf };
