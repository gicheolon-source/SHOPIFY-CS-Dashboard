const { handler, send, body, requireUser, HttpError } = require('../lib/http');
const ai = require('../lib/ai');
const gmail = require('../lib/gmail');
const shopify = require('../lib/shopify');
const tickets = require('../lib/tickets');
const { getSettings } = require('../lib/settings');

// 답장 초안 한 건 만들기 (메일·관련 메일·Shopify 주문·CS 가이드·답변 템플릿 참고)
async function buildDraft(id, { instruction = '', template = '', author }) {
  const [{ thread, ticket }, settings, ourEmails] = await Promise.all([tickets.conversation(id), getSettings(), tickets.ourEmails()]);
  if (!ticket) throw new HttpError(404, '티켓을 찾을 수 없습니다');
  const [shop, related] = await Promise.all([
    shopify.lookup({ email: ticket.customer?.email, orderRefs: ticket.orderRefs || [] }).catch(() => ({ orders: [] })),
    // 이미 대화에 합쳐진 스레드는 빼고 찾는다
    gmail.findRelated([id, ...(ticket.related || [])], { orderRefs: ticket.orderRefs || [], email: ticket.customer?.email }).catch(() => []),
  ]);
  const draft = await ai.draftReply({
    thread,
    ticket,
    orders: shop.orders,
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
  const { action, id, instruction, template } = await body(req);
  if (!id) throw new HttpError(400, 'id가 필요합니다');

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
