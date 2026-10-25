// 자주 쓰는 답변 기본값. 설정 탭에서 고치면 cs/settings.json의 templates가 이걸 대신한다.
// 치환: {name} 고객 이름, {order} 메일 속 주문번호, {signature} 서명
// [확인 필요: …] 는 팀이 실제 정책으로 채워야 하는 자리 — 보내기 전에 반드시 지운다.
// 팀 CS 매뉴얼 답변(templates-team.js)이 먼저, 매뉴얼에 없는 상황용 일반 답변이 뒤에 온다.
module.exports = [
  ...require('./templates-team'),

  // ---------- 제품 FAQ ----------
  {
    id: 'faq-routine', cat: '제품 FAQ', title: '사용 순서 · 루틴', types: ['제품 문의'],
    body: `Hi {name},

Thank you for your question!

A simple rule for layering: go from the thinnest texture to the thickest.
1. Cleanser → toner
2. Serum (e.g. PDRN serum)
3. Cream (e.g. PDRN cream or barrier cream)
4. Sunscreen in the morning

If you use a retinol product, we recommend applying it at night only, and using sunscreen every morning. When you are just starting, use it every other night for the first 1–2 weeks so your skin can adjust.

Let us know which products you have and we will be happy to suggest a routine.

{signature}`,
  },
  {
    id: 'faq-sensitive', cat: '제품 FAQ', title: '민감성 피부 · 패치 테스트', types: ['제품 문의', '피부 트러블'],
    body: `Hi {name},

Thank you for reaching out.

If you have sensitive skin, we recommend a patch test before full use: apply a small amount behind the ear or on the inner forearm once a day for 2–3 days. If there is no redness, itching or stinging, you can start using it on your face.

When introducing a new product, add one product at a time so you can tell how your skin responds. If you notice any irritation, please stop using it and let us know.

{signature}`,
  },
  {
    id: 'faq-pregnancy', cat: '제품 FAQ', title: '임신 · 수유 중 사용', types: ['제품 문의'],
    body: `Hi {name},

Thank you for asking — and congratulations!

Because every pregnancy is different, we always recommend checking with your doctor before using any skincare product during pregnancy or breastfeeding. You can share the full ingredient list (on the product page and packaging) with them.

As a general guideline, products containing retinol or retinoids are usually avoided during pregnancy. [확인 필요: 임신 중 비권장 제품 목록]

{signature}`,
  },
  {
    id: 'faq-ingredients', cat: '제품 FAQ', title: '성분 · 전성분 문의', types: ['제품 문의'],
    body: `Hi {name},

Thank you for your interest in our ingredients.

You can find the full ingredient list (INCI) on each product page on our website, as well as on the outer box. [확인 필요: 요청 성분 포함 여부 — 예: 향료·알코올·나이아신아마이드]

If you are checking for a specific ingredient or allergy, let us know which one and we will confirm it for you.

{signature}`,
  },
  {
    id: 'faq-pdrn', cat: '제품 FAQ', title: 'PDRN이 뭔가요?', types: ['제품 문의'],
    body: `Hi {name},

Great question! PDRN (polydeoxyribonucleotide) is a skincare ingredient known in Korean dermatology for supporting the skin's moisture barrier and helping skin look smoother and more refreshed.

The PDRN in our products is marine-derived (from salmon).

As with any skincare, results vary from person to person, and consistent daily use works best.

{signature}`,
  },
  {
    id: 'faq-shelf-life', cat: '제품 FAQ', title: '유통기한 · 개봉 후 사용기한', types: ['제품 문의'],
    body: `Hi {name},

Thank you for asking.

Unopened, our products last [확인 필요: 제조일로부터 N개월]. Once opened, we recommend using them within [확인 필요: 개봉 후 N개월] (shown by the open-jar symbol on the packaging).

You can find the manufacturing/expiry date [확인 필요: 표기 위치 — 박스 하단 등]. Please store the products in a cool place away from direct sunlight.

{signature}`,
  },
  {
    id: 'faq-combine', cat: '제품 FAQ', title: '다른 성분과 같이 써도 되나요', types: ['제품 문의'],
    body: `Hi {name},

Thank you for your question!

In general:
- Retinol + vitamin C: use vitamin C in the morning and retinol at night, rather than at the same time.
- Retinol + AHA/BHA exfoliants: avoid using them on the same night to reduce the chance of irritation.
- PDRN, ceramide and hyaluronic acid products are generally gentle and easy to combine with the rest of your routine.

If you tell us the exact products you are using, we are happy to check your routine for you.

{signature}`,
  },
  {
    id: 'faq-results', cat: '제품 FAQ', title: '효과는 언제 나타나나요', types: ['제품 문의'],
    body: `Hi {name},

Thank you for reaching out.

Skin renews itself over roughly 4 weeks, so we recommend using the product consistently for at least 4–8 weeks before judging the results. Hydration and comfort are often felt sooner, while changes in tone and texture take longer.

Results vary from person to person. Using sunscreen daily and keeping your routine simple will help you get the most out of it.

{signature}`,
  },
  {
    id: 'faq-recommend', cat: '제품 FAQ', title: '피부 타입별 제품 추천', types: ['제품 문의'],
    body: `Hi {name},

We would love to help you find the right products!

Could you tell us a little about your skin?
1. Skin type (dry, oily, combination, sensitive)
2. Main concerns (e.g. dullness, dark spots, fine lines, redness, dryness)
3. Products you are currently using

Based on your answers, we will suggest a simple routine. [확인 필요: 피부 고민별 추천 제품 매칭표]

{signature}`,
  },
  {
    id: 'faq-restock', cat: '제품 FAQ', title: '품절 · 재입고 문의', types: ['제품 문의', '주문/결제'],
    body: `Hi {name},

Thank you for your interest — we are sorry the product is currently out of stock.

We expect it to be back [확인 필요: 재입고 예정일]. You can click "Notify me when available" on the product page to get an email as soon as it is restocked. [확인 필요: 재입고 알림 기능 유무]

{signature}`,
  },

  // ---------- 배송 · 주문 ----------
  {
    id: 'ship-status', cat: '배송 · 주문', title: '배송 조회 안내', types: ['배송'],
    body: `Hi {name},

Thank you for your patience, and sorry for any worry.

I checked your order {order}: [확인 필요: 현재 배송 상태 · 택배사 · 송장번호]
You can track it here: [확인 필요: 송장 조회 링크]

International shipping usually takes [확인 필요: 국가별 평균 배송일] business days. Tracking can sometimes pause while the package is in customs — this is normal and it usually updates within a few days.

If there is no update by [확인 필요: 날짜], please reply to this email and we will look into it right away.

{signature}`,
  },
  {
    id: 'order-wrong-item', cat: '배송 · 주문', title: '오배송 · 파손', types: ['교환/환불', '배송'],
    body: `Hi {name},

We are so sorry about this — that's not the experience we want for you.

Could you please send us a photo of the item you received (and the shipping label/box if it was damaged)? Once we confirm, we will arrange the next step for order {order} as quickly as possible. [확인 필요: 재발송/환불 처리 방식]

{signature}`,
  },
  {
    id: 'ship-delay-customs', cat: '배송 · 주문', title: '배송 지연 · 통관 대기', types: ['배송'],
    body: `Hi {name},

We are sorry your order {order} is taking longer than expected.

Your package is currently [확인 필요: 현재 위치 — 통관 대기/현지 택배사 인계 등]. International parcels can be held at customs for a few extra days, and tracking often doesn't update during that time. This is normal and the package usually continues moving without any action needed.

We are keeping an eye on it. If there is no movement by [확인 필요: 날짜], we will contact the carrier and update you.

{signature}`,
  },
  {
    id: 'ship-delivered-missing', cat: '배송 · 주문', title: '배송 완료인데 못 받음', types: ['배송'],
    body: `Hi {name},

We are sorry to hear that — let's find your package.

The tracking for order {order} shows it was delivered on [확인 필요: 배송 완료일]. Could you please:
1. Check around your door, mailbox, reception/concierge or with neighbors
2. Confirm the shipping address on your order is correct
3. Wait 1–2 more days, as carriers sometimes mark parcels delivered a little early

If it still doesn't turn up, reply to this email and we will open an investigation with the carrier.

{signature}`,
  },
  {
    id: 'ship-customs-fee', cat: '배송 · 주문', title: '관세 · 세금 문의', types: ['배송', '주문/결제'],
    body: `Hi {name},

Thank you for your question.

[확인 필요: 관세 포함(DDP) 여부 — 둘 중 하나만 남기기]
- Duties and taxes are included in your order total, so there is nothing extra to pay on delivery.
- Import duties and taxes depend on your country's rules and are paid by the recipient on delivery. They are not included in the price on our website.

If you received a request for payment, please send us a screenshot and we will check that it's genuine.

{signature}`,
  },
  {
    id: 'order-discount', cat: '배송 · 주문', title: '할인 코드가 안 돼요', types: ['주문/결제'],
    body: `Hi {name},

Sorry for the trouble with your discount code!

A few common reasons a code doesn't apply:
- It has expired or reached its usage limit
- The cart doesn't meet the minimum amount
- It can't be combined with another discount or sale item
- It is limited to first orders or specific products

[확인 필요: 해당 코드 조건 확인 후 안내 / 대체 코드 발급 여부]

{signature}`,
  },
  {
    id: 'order-payment', cat: '배송 · 주문', title: '결제 오류 · 이중 결제', types: ['주문/결제'],
    body: `Hi {name},

Thank you for letting us know, and sorry for the worry.

Sometimes a bank shows a temporary "pending" authorization when a payment fails or is retried. These holds are released automatically by your bank, usually within [확인 필요: 3–7] business days, and are not actual charges.

We checked our system: [확인 필요: 실제 결제 건수 · 주문번호]. If you still see two completed charges after that period, please send us a screenshot of your statement (hide your card number) and we will sort it out.

{signature}`,
  },

  // ---------- 정품 · 피부 ----------
  {
    id: 'authentic', cat: '정품 · 피부', title: '정품 확인 요청', types: ['정품 인증'],
    after: '고객 대기',
    body: `Hi {name},

Thank you for checking with us — we take product authenticity seriously.

To help us verify, could you please send:
1. Where you purchased the product (store name or link)
2. Photos of the front and back of the box, and the batch/lot number printed on it

Our official website is https://drrejuall.com/, and we also sell through authorized retailers such as StyleKorean. We will review the details and get back to you shortly.

{signature}`,
  },
  {
    id: 'skin-reaction', cat: '정품 · 피부', title: '피부 트러블 첫 응대', types: ['피부 트러블'],
    after: '고객 대기',
    body: `Hi {name},

We are very sorry to hear about your skin's reaction, and thank you for letting us know.

Please stop using the product for now. If the redness, itching or swelling continues or gets worse, we recommend seeing a dermatologist or doctor.

To help us look into it, could you share:
1. Which product(s) you used and for how many days
2. A photo of the affected area (only if you are comfortable)
3. Your order number, if you have it

We will follow up with you as soon as we have reviewed this.

{signature}`,
  },


  // ---------- 마케팅 · 제휴 ----------
  {
    id: 'mkt-decline-collab', cat: '마케팅 · 제휴', title: '협업 정중한 거절', types: ['제휴/인플루언서'],
    after: '종결',
    body: `Hi {name},

Thank you for thinking of Dr.Reju-All and for your kind proposal.

After reviewing it, we have decided not to move forward at this time, as it doesn't match our current campaign plans. We will keep your details on file and reach out if a suitable opportunity comes up.

We wish you all the best with your content!

{signature}`,
  },
  {
    id: 'mkt-decline-agency', cat: '마케팅 · 제휴', title: '대행사 · 영업 메일 거절', types: ['스팸/광고', '기타'],
    after: '종결',
    body: `Hi {name},

Thank you for reaching out and for introducing your services.

We are not looking for new partners in this area at the moment, so we will pass for now. Please feel free to remove us from your follow-up list.

{signature}`,
  },
  {
    id: 'mkt-review-thanks', cat: '마케팅 · 제휴', title: '좋은 후기 감사 · 리뷰 요청', types: ['기타', '제품 문의'],
    body: `Hi {name},

Thank you so much for your kind words — it truly made our day!

If you have a moment, we would be grateful if you could share your experience as a review on our website [확인 필요: 리뷰 페이지 링크]. It really helps other customers find the right products.

Thank you for being part of the Dr.Reju-All community.

{signature}`,
  },
  {
    id: 'mkt-press', cat: '마케팅 · 제휴', title: '언론 · 인터뷰 · 기사 문의', types: ['제휴/인플루언서', '기타'],
    body: `Hi {name},

Thank you for your interest in featuring Dr.Reju-All.

Could you share a few details so we can prepare?
1. Publication or media outlet and target audience
2. Topic or angle of the article/interview
3. Deadline and the format you need (written Q&A, call, product images)

We will forward this to our marketing team and get back to you shortly. [확인 필요: 보도자료·제품 이미지 키트 링크]

{signature}`,
  },
  {
    id: 'mkt-affiliate', cat: '마케팅 · 제휴', title: '어필리에이트 · 제휴 프로그램 안내', types: ['제휴/인플루언서'],
    body: `Hi {name},

Thank you for your interest in partnering with us!

[확인 필요: 운영 중인 제휴 채널 — 예: 자체 어필리에이트 프로그램 링크, TikTok Shop 어필리에이트, Amazon Influencer]
Commission: [확인 필요: 커미션율]

Once you sign up, you will get your own link and discount code to share with your audience. Let us know if you have any questions.

{signature}`,
  },

  // ---------- 일반 응대 ----------
  {
    id: 'gen-need-info', cat: '일반 응대', title: '주문번호 · 정보 요청', types: ['배송', '주문/결제', '교환/환불', '기타'],
    after: '고객 대기',
    body: `Hi {name},

Thank you for reaching out! We would be happy to help.

To look into this, could you please send us:
- Your order number (it starts with [확인 필요: 주문번호 형식 — 예: DR#] and is in your order confirmation email)
- The email address used for the order, if different from this one

{signature}`,
  },
  {
    id: 'gen-delay-sorry', cat: '일반 응대', title: '답장 지연 사과', types: [],
    body: `Hi {name},

Thank you for your patience, and we are sorry for the late reply. We have been receiving a higher volume of messages than usual.

[본문]

{signature}`,
  },
  {
    id: 'gen-followup', cat: '일반 응대', title: '해결 확인 · 마무리', types: [],
    after: '종결',
    body: `Hi {name},

I just wanted to follow up and check whether everything has been resolved on your side.

If there is anything else we can help with, simply reply to this email — we are always happy to help.

{signature}`,
  },
  {
    id: 'gen-chargeback', cat: '일반 응대', title: '결제 분쟁(차지백) 고객 연락', types: ['주문/결제'],
    body: `Hi {name},

We noticed that a payment dispute was opened for order {order}. We are sorry that you had to take this step, and we would like to resolve the issue with you directly.

Could you let us know what happened with your order? [확인 필요: 주문·배송 상태 확인 후 해결책 제시]

Once we have resolved it together, we kindly ask that you contact your bank to close the dispute.

{signature}`,
  },
  {
    id: 'gen-ko', cat: '일반 응대', title: '한국어 문의 기본 회신', types: [],
    body: `안녕하세요, {name}님.
닥터리쥬올 고객센터입니다.

문의 주셔서 감사합니다. [본문]

추가로 궁금하신 점이 있으시면 언제든 이 메일로 회신 주세요.
감사합니다.

닥터리쥬올 고객센터 드림`,
  },
];
