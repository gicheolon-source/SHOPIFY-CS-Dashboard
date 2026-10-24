// 자주 쓰는 답변 기본값. 설정 탭에서 고치면 cs/settings.json의 templates가 이걸 대신한다.
// 치환: {name} 고객 이름, {order} 메일 속 주문번호, {signature} 서명
// [확인 필요: …] 는 팀이 실제 정책으로 채워야 하는 자리 — 보내기 전에 반드시 지운다.
module.exports = [
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

The PDRN in our products is [확인 필요: 원료 유래 — 연어 유래/식물 유래].

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
    id: 'ship-address', cat: '배송 · 주문', title: '배송지 변경 요청', types: ['배송', '주문/결제'],
    body: `Hi {name},

Thank you for letting us know.

[확인 필요: 출고 전/후 선택 후 하나만 남기기]
- (Not shipped yet) We have updated the shipping address for order {order} to the address below. Please double-check it:
  [새 주소]
- (Already shipped) Unfortunately order {order} has already left our warehouse, so we can no longer change the address. You may be able to request a redirect directly with the carrier using your tracking number: [송장번호]

{signature}`,
  },
  {
    id: 'order-return', cat: '배송 · 주문', title: '교환 · 환불 접수', types: ['교환/환불'],
    body: `Hi {name},

We are sorry the order didn't work out as expected.

To help us review your request for order {order}, could you please send us:
1. A photo of the product(s) and the outer box
2. A short description of the issue

Our policy covers unopened products within 30 days of delivery. Once we receive the details, we will review them and get back to you with the next steps.

{signature}`,
  },
  {
    id: 'order-wrong-item', cat: '배송 · 주문', title: '오배송 · 파손', types: ['교환/환불', '배송'],
    body: `Hi {name},

We are so sorry about this — that's not the experience we want for you.

Could you please send us a photo of the item you received (and the shipping label/box if it was damaged)? Once we confirm, we will arrange the next step for order {order} as quickly as possible. [확인 필요: 재발송/환불 처리 방식]

{signature}`,
  },

  // ---------- 정품 · 피부 ----------
  {
    id: 'authentic', cat: '정품 · 피부', title: '정품 확인 요청', types: ['정품 인증'],
    body: `Hi {name},

Thank you for checking with us — we take product authenticity seriously.

To help us verify, could you please send:
1. Where you purchased the product (store name or link)
2. Photos of the front and back of the box, and the batch/lot number printed on it

Our official sales channels are [확인 필요: 공식몰 · 공식 판매처 목록]. We will review the details and get back to you shortly.

{signature}`,
  },
  {
    id: 'skin-reaction', cat: '정품 · 피부', title: '피부 트러블 첫 응대', types: ['피부 트러블'],
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

  // ---------- B2B ----------
  {
    id: 'b2b-first', cat: 'B2B', title: '도매 · 유통 문의 1차 회신', types: ['B2B/도매'],
    body: `Hi {name},

Thank you for your interest in carrying Dr.Reju-All.

To prepare the right proposal, could you share a few details?
1. Company name, country and website
2. Sales channels (offline stores, online marketplaces, clinics, etc.)
3. Products you are interested in and estimated order volume
4. Whether you are looking for exclusive distribution in your region

Once we receive this, our B2B team will review it and send our wholesale terms. [확인 필요: 회신 소요 기간]

{signature}`,
  },
  {
    id: 'b2b-terms', cat: 'B2B', title: '도매 조건 안내', types: ['B2B/도매'],
    body: `Hi {name},

Thank you for the details. Please find our wholesale terms below:

- Price list: [확인 필요: 첨부 또는 링크]
- MOQ: [확인 필요: 최소 주문 수량]
- Payment: [확인 필요: 결제 조건 — 예: 선결제 T/T]
- Lead time: [확인 필요: 생산·출고 소요]
- Shipping: [확인 필요: 인코텀즈 — EXW/FOB 등]

Product certificates and documents (e.g. CPNP, MSDS) are available upon request. [확인 필요: 보유 인증]

Let us know if you have any questions.

{signature}`,
  },
  {
    id: 'b2b-samples', cat: 'B2B', title: 'B2B 샘플 요청', types: ['B2B/도매'],
    body: `Hi {name},

Thank you for your interest in testing our products.

We are happy to send samples for evaluation. [확인 필요: 샘플 비용·배송비 부담 조건]
Please send us the shipping address, recipient name and phone number, along with the products you would like to try.

{signature}`,
  },

  // ---------- 마케팅 · 제휴 ----------
  {
    id: 'mkt-influencer', cat: '마케팅 · 제휴', title: '인플루언서 협업 문의 회신', types: ['제휴/인플루언서'],
    body: `Hi {name},

Thank you so much for reaching out and for your interest in Dr.Reju-All!

So we can review your proposal, could you please share:
1. Your channel links and main platform
2. Follower count, average views and audience demographics (country, age)
3. Your rate card or preferred collaboration type (gifted, paid, affiliate)

Our marketing team will review it and get back to you if it's a good fit.

{signature}`,
  },
  {
    id: 'mkt-decline-collab', cat: '마케팅 · 제휴', title: '협업 정중한 거절', types: ['제휴/인플루언서'],
    body: `Hi {name},

Thank you for thinking of Dr.Reju-All and for your kind proposal.

After reviewing it, we have decided not to move forward at this time, as it doesn't match our current campaign plans. We will keep your details on file and reach out if a suitable opportunity comes up.

We wish you all the best with your content!

{signature}`,
  },
  {
    id: 'mkt-decline-agency', cat: '마케팅 · 제휴', title: '대행사 · 영업 메일 거절', types: ['스팸/광고', '기타'],
    body: `Hi {name},

Thank you for reaching out and for introducing your services.

We are not looking for new partners in this area at the moment, so we will pass for now. Please feel free to remove us from your follow-up list.

{signature}`,
  },
];
