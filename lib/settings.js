const { readJSON, updateJSON } = require('./store');
const TEMPLATES = require('./templates');

const PATH = 'cs/settings.json';

const DEFAULTS = {
  // 대시보드로 가져올 Gmail 검색식
  query: 'in:inbox -category:promotions -category:social newer_than:60d',
  // 우리 쪽 발신 주소(연결된 계정 외에 별칭이 있으면 추가)
  aliases: [],
  // AI 답장 초안이 따를 CS 정책·톤 가이드
  guide: [
    '- 브랜드: Dr.Reju-All (닥터리쥬올), 한국 더마 코스메틱. PDRN·세라마이드·레티놀 라인.',
    '- 톤: 정중하고 따뜻하게, 짧고 명확하게. 고객 언어로 답장.',
    '- 배송 문의: 주문번호와 송장 조회 링크를 안내. 지연 시 사과 + 예상 일정.',
    '- 교환/환불: 수령 후 30일 이내 미개봉 제품 기준. 확정 전에는 "확인 후 안내드리겠다"고만 답하고 금액·승인을 약속하지 않는다.',
    '- 피부 트러블: 사용 중단 권유, 사진 요청, 의학적 진단은 하지 않는다.',
    '- 정품 인증: 구매처(공식몰·공식 판매처 여부)와 제품·박스 사진, 제조번호를 요청. 확인 전에는 정품/가품을 단정하지 않는다.',
    '- 제휴/인플루언서: 담당자가 검토 후 회신한다고 안내.',
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
  })).filter((t) => t.title && t.body.trim());
}

async function saveSettings(patch, by) {
  const allowed = {};
  if (typeof patch.query === 'string' && patch.query.trim()) allowed.query = patch.query.trim().slice(0, 500);
  if (Array.isArray(patch.aliases)) allowed.aliases = patch.aliases.map((a) => String(a).trim().toLowerCase()).filter(Boolean).slice(0, 20);
  if (typeof patch.guide === 'string') allowed.guide = patch.guide.slice(0, 20000);
  if (typeof patch.signature === 'string') allowed.signature = patch.signature.slice(0, 1000);
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
