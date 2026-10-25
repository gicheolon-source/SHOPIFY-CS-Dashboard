const { readJSON, updateJSON } = require('./store');
const TEMPLATES = require('./templates');

const PATH = 'cs/settings.json';

const DEFAULTS = {
  // 대시보드로 가져올 Gmail 검색식
  query: 'in:inbox -category:promotions -category:social newer_than:60d',
  // 우리 쪽 발신 주소(연결된 계정 외에 별칭이 있으면 추가)
  aliases: [],
  // 자동 발송·알림 메일 발신자: 들어오면 자동 종결(AI 분류도 생략).
  // 'xxx@' = 이 아이디로 시작, 'domain.com' = 그 도메인(하위 도메인 포함), 전체 주소 = 그 주소만
  autoClose: [
    'no-reply@', 'noreply@', 'do-not-reply@', 'donotreply@', 'notification@', 'notifications@', 'alerts@', 'mailer-daemon@',
    'facebookmail.com', 'facebook.com', 'accounts.google.com', 'ads-service.tiktok.com', 'notifications.levanta.io', 'mailer@shopify.com',
  ],
  // '고객 대기'로 둔 문의에 이 일수 동안 회신이 없으면 '팔로업 필요'로 다시 연다
  followupDays: 3,
  // 답장이 필요한 새 문의에 AI 초안을 미리 만들어 둔다 (문의 1건당 Claude 호출 1번)
  autoDraft: true,
  // 보내기 직전 AI가 답장을 검수 (Sonnet, 답장 1통당 1번)
  aiReview: true,
  // VIP 배지: 누적 구매액(USD 등 스토어 통화) 이상. vipOrders > 0이면 누적 주문 수 기준도 같이 본다
  vipOrders: 0,
  vipSpend: 500,
  // AI 답장 초안이 따를 CS 정책·톤 가이드
  guide: [
    '- 브랜드: Dr.Reju-All (닥터리쥬올), 한국 더마 코스메틱. PDRN·세라마이드·레티놀 라인.',
    '- 톤: 정중하고 따뜻하게, 짧고 명확하게. 고객 언어로 답장.',
    '- 배송 문의: 주문번호와 송장 조회 링크를 안내. 지연 시 사과 + 예상 일정.',
    '- 교환/환불: 수령 후 30일 이내 미개봉 제품 기준. 확정 전에는 "확인 후 안내드리겠다"고만 답하고 금액·승인을 약속하지 않는다.',
    '- 피부 트러블: 사용 중단 권유, 사진 요청, 의학적 진단은 하지 않는다.',
    '- 정품 인증: 구매처(공식몰·공식 판매처 여부)와 제품·박스 사진, 제조번호를 요청. 확인 전에는 정품/가품을 단정하지 않는다.',
    '- 제휴/인플루언서: 팔로워 수·평균 조회수·오디언스 정보 요청 후 마케팅팀이 검토해 회신한다고 안내.',
    '- B2B/도매·유통 문의: 조건을 직접 안내하지 않는다. B2B팀 메일 global_sales@neosimplix.com 으로 안내하거나, 주요 국가·소규모 업체는 정중히 거절.',
    '- 공식몰: https://drrejuall.com/ · 해외(미배송 국가) 구매는 공식 파트너 StyleKorean(https://www.stylekorean.com) 안내. 사칭 사이트 주문이면 취소·환불 요청 권유.',
    '- 배송: Amazon Shipping/MCF(아마존 창고) 이용. $30 이상 무료 배송은 지상 배송 기준이라 하와이 등은 배송비 발생.',
    '- 환불: 원결제 수단으로, 보통 5–7영업일(카드사에 따라 최대 10영업일). 반품 환불은 7–10영업일. 반품은 USPS 선불 라벨 발송.',
    '- 아마존에서 산 주문: 우리가 개인정보를 볼 수 없으니 교체 시 이름·주소·연락처를 요청하거나 아마존 고객센터로 안내.',
    '- 성분: 동물 유래 원료는 연어 유래 PDRN(Sodium DNA)·가수분해 콜라겐뿐. 육상동물 원료 없음, BSE-free, 동물실험 안 함(Cruelty-free). 비건·할랄 공식 인증은 없음(Retino-Mela Serum만 동물성 원료 없음, 인증은 아님).',
  ].join('\n'),
  signature: 'Best regards,\nDr.Reju-All Customer Care',
  // 자주 쓰는 답변: 답장 작성창에서 삽입하고, AI 초안도 참고한다
  templates: TEMPLATES,
};

// 팀이 저장한 답변 + 나중에 추가된 기본 답변(팀이 지운 건 제외)
function withTemplates(data) {
  const { templatesRemoved, ...rest } = data;
  if (!Array.isArray(data.templates)) return { ...DEFAULTS, ...rest };
  const have = new Set(data.templates.map((t) => t.id));
  const removed = new Set(templatesRemoved || []);
  return { ...DEFAULTS, ...rest, templates: [...data.templates, ...TEMPLATES.filter((t) => !have.has(t.id) && !removed.has(t.id))] };
}

async function getSettings() {
  const { data } = await readJSON(PATH, {});
  return withTemplates(data);
}

function cleanTemplates(list) {
  const str = (v, max) => String(v || '').trim().slice(0, max);
  return list.slice(0, 100).map((t, i) => ({
    id: str(t.id, 60) || `t${Date.now().toString(36)}${i}`,
    cat: str(t.cat, 30) || '기타',
    title: str(t.title, 100),
    body: String(t.body || '').slice(0, 5000),
    types: Array.isArray(t.types) ? t.types.map((x) => str(x, 30)).filter(Boolean).slice(0, 10) : [],
    action: str(t.action, 1000),
    after: ['진행중', '고객 대기', '답변완료', '종결'].includes(t.after) ? t.after : '',
    forward: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(t.forward, 200)) ? str(t.forward, 200).toLowerCase() : '',
    // 매크로: 이 답변을 넣을 때 같이 준비할 Shopify 작업 (취소·주소 변경·환불·메모·비용 기록)
    shopify: ['cancel', 'address', 'refund', 'note', 'cost'].includes(t.shopify) ? t.shopify : '',
  })).filter((t) => t.title && t.body.trim());
}

async function saveSettings(patch, by) {
  const allowed = {};
  if (typeof patch.query === 'string' && patch.query.trim()) allowed.query = patch.query.trim().slice(0, 500);
  if (Array.isArray(patch.aliases)) allowed.aliases = patch.aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (Number.isFinite(Number(patch.followupDays))) allowed.followupDays = Math.min(30, Math.max(1, Math.round(Number(patch.followupDays))));
  if (Array.isArray(patch.autoClose)) allowed.autoClose = patch.autoClose.map((a) => String(a).trim().toLowerCase()).filter(Boolean).slice(0, 100);
  if (typeof patch.guide === 'string') allowed.guide = patch.guide.slice(0, 20000);
  if (typeof patch.signature === 'string') allowed.signature = patch.signature.slice(0, 1000);
  if (typeof patch.autoDraft === 'boolean') allowed.autoDraft = patch.autoDraft;
  if (typeof patch.aiReview === 'boolean') allowed.aiReview = patch.aiReview;
  if (Number(patch.vipOrders) >= 0) allowed.vipOrders = Math.round(Number(patch.vipOrders));
  if (Number(patch.vipSpend) > 0) allowed.vipSpend = Math.round(Number(patch.vipSpend));
  if (Array.isArray(patch.templates)) allowed.templates = cleanTemplates(patch.templates);
  const saved = await updateJSON(PATH, {}, (data) => {
    if (allowed.templates) {
      const kept = new Set(allowed.templates.map((t) => t.id));
      allowed.templatesRemoved = [...new Set([...(data.templatesRemoved || []), ...TEMPLATES.filter((t) => !kept.has(t.id)).map((t) => t.id)])];
    }
    return { ...data, ...allowed, updatedBy: by, updatedAt: Date.now() };
  });
  return withTemplates(saved);
}

module.exports = { getSettings, saveSettings, DEFAULTS };
