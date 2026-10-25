const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const ai = require('../lib/ai');
const gmail = require('../lib/gmail');
const shopify = require('../lib/shopify');
const amazon = require('../lib/amazon');
const tickets = require('../lib/tickets');
const { getSettings } = require('../lib/settings');

// 아마존 MCF 출고·재발송 요약 (실패해도 답장 초안은 계속 만든다)
async function mcfText(ticket, shop) {
  if (!amazon.configured() && process.env.DEMO_MODE !== '1') return '';
  const m = await amazon.lookup(amazon.queryFor(ticket, shop)).catch((err) => ({ error: err.message }));
  return m.error ? `조회 실패: ${m.error}` : amazon.context(m);
}

// 답장 초안 한 건 만들기 (메일·관련 메일·Shopify 주문·아마존 MCF·CS 가이드·답변 템플릿 참고)
async function buildDraft(id, { instruction = '', template = '', author }) {
  const [{ thread, ticket }, settings, ourEmails] = await Promise.all([tickets.conversation(id), getSettings(), tickets.ourEmails()]);
  if (!ticket) throw new HttpError(404, '티켓을 찾을 수 없습니다');
  const [shop, related] = await Promise.all([
    shopify.lookup({ email: ticket.customer?.email, orderRefs: ticket.orderRefs || [] }).catch(() => ({ orders: [] })),
    // 이미 대화에 합쳐진 스레드는 빼고 찾는다
    gmail.findRelated([id, ...(ticket.related || [])], { orderRefs: ticket.orderRefs || [], email: ticket.customer?.email }).catch(() => []),
  ]);
  await tickets.saveCustomerStats(ticket, shop.customer).catch(() => {});
  const mcf = await mcfText(ticket, shop);
  const draft = await ai.draftReply({
    thread,
    ticket,
    orders: shop.orders,
    mcf,
    related,
    settings,
    ourEmails,
    instruction: String(instruction || '').slice(0, 1000),
    template: template ? String(template).slice(0, 6000) : '',
    author,
  });
  return { draft, ticket };
}

module.exports = handler(async (req, res) => {
  const user = requireUser(req);
  if (req.method !== 'POST') throw new HttpError(405, 'POST만 지원합니다');
  const { action, id, instruction, template, text } = await body(req);
  if (!id) throw new HttpError(400, 'id가 필요합니다');

  // 보내기 전 검수: 실수만 짚어 주고 막지는 않는다
  if (action === 'review') {
    if (!ai.enabled()) return send(res, 200, { issues: [], skipped: true });
    const [{ thread, ticket }, settings, ourEmails] = await Promise.all([tickets.conversation(id), getSettings(), tickets.ourEmails()]);
    const shop = await shopify.lookup({ email: ticket?.customer?.email, orderRefs: ticket?.orderRefs || [] }).catch(() => ({ orders: [] }));
    const mcf = ticket ? await mcfText(ticket, shop) : '';
    const issues = await ai.reviewReply({ reply: String(text || ''), thread, orders: shop.orders, mcf, settings, ourEmails });
    return send(res, 200, { issues });
  }

  // 비슷한 과거 처리: 처리 끝난 문의 중 비슷한 건 + 그때 보낸 답장·처리 이력
  if (action === 'similar') {
    if (!ai.enabled()) throw new HttpError(400, 'AI 키가 없어 찾을 수 없습니다');
    const { tickets: all } = await tickets.readTickets();
    const cur = all[id];
    if (!cur) throw new HttpError(404, '티켓을 찾을 수 없습니다');
    const pool = Object.values(all)
      .filter((t) => t.id !== id && !t.groupId && !(cur.related || []).includes(t.id) && ['답변완료', '종결', '고객 대기'].includes(t.status)
        && !t.autoClosed && t.type !== '스팸/광고' && t.summary)
      .sort((a, b) => (b.type === cur.type) - (a.type === cur.type) || b.lastAt - a.lastAt)
      .slice(0, 80);
    const matches = await ai.findSimilar(
      { type: cur.type, summary: cur.summary, subject: cur.subject, snippet: (cur.snippet || '').slice(0, 300) },
      pool.map((t) => ({ id: t.id, type: t.type, summary: t.summary, subject: t.subject })),
    );
    const ourEmails = await tickets.ourEmails();
    const results = await Promise.all(matches.map(async (m) => {
      const t = all[m.id];
      const thread = await gmail.threadFull(m.id).catch(() => null);
      const ours = thread?.messages.filter((x) => ourEmails.includes(x.from.email)) || [];
      const last = ours[ours.length - 1];
      return {
        id: t.id, why: m.why, subject: t.subject, summary: t.summary, status: t.status, firstAt: t.firstAt,
        customer: t.customer?.name || t.customer?.email,
        reply: last ? (last.text || last.snippet || '').slice(0, 1200) : '',
        actions: (t.history || []).filter((h) => /Shopify|전달|상태|비용/.test(h.text)).slice(-6).map((h) => `${h.by}: ${h.text}`),
      };
    }));
    return send(res, 200, { results });
  }

  if (action === 'draft') {
    const { draft } = await buildDraft(id, { instruction, template, author: user.name });
    return send(res, 200, draft);
  }

  // 미리 만들기: 새 문의가 들어오면 화면이 열린 팀원 브라우저가 백그라운드로 부른다.
  // 결과는 티켓에 저장돼 누가 열어도 바로 보인다. 같은 고객 메일에는 한 번만 만든다.
  if (action === 'prefill') {
    if (!ai.enabled()) return send(res, 200, { skipped: 'AI 키 없음' });
    const t = await tickets.getTicket(id);
    if (!t) throw new HttpError(404, '티켓을 찾을 수 없습니다');
    if (t.draft && t.draft.for >= t.lastCustomerAt) return send(res, 200, { ticket: t, cached: true });
    if (t.draftPendingAt && Date.now() - t.draftPendingAt < 3 * 60_000) return send(res, 200, { skipped: '다른 팀원이 만드는 중' });
    await tickets.updateTicket(id, {}, 'AI', { fields: { draftPendingAt: Date.now() } });
    try {
      const { draft } = await buildDraft(id, { author: 'CS팀' });
      const ticket = await tickets.updateTicket(id, {}, 'AI', {
        fields: { draft: { reply: draft.reply, ko: draft.ko, notes: draft.notes, for: t.lastCustomerAt, at: Date.now() }, draftPendingAt: null },
      });
      return send(res, 200, { ticket });
    } catch (err) {
      await tickets.updateTicket(id, {}, 'AI', { fields: { draftPendingAt: null } }).catch(() => {});
      throw err;
    }
  }
  throw new HttpError(400, '알 수 없는 요청');
});
