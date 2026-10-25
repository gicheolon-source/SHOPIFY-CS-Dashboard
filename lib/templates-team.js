// 팀 CS 자동응답 매뉴얼(2026-10-25). 문구는 매뉴얼 그대로, 인사·서명만 붙였다.
// action = 담당자가 할 내부 처리 (고객에게 보내지 않음)
// [ ] 빈칸은 답변을 넣을 때 AI가 메일·주문 내용으로 채운다.
const hi = (body) => `Hi {name},\n\n${body}\n\n{signature}`;

module.exports = [
  // ---------- B2B 문의 ----------
  {
    id: 'm-b2b-decline', cat: 'B2B 문의', title: '메인 국가·소규모 업체 거절', types: ['B2B/도매'],
    after: '종결',
    body: hi(`Thank you very much for your interest in our brand and for reaching out about becoming a business partner with us.
We truly appreciate your interest. However, at this time, we are not accepting new authorized resellers or distribution partners in the [국가명].
While we are unable to move forward with your request, we sincerely value your interest in our products and appreciate your understanding.
Thank you again for considering our brand, and we wish you all the best in your future endeavors.`),
  },
  {
    id: 'm-b2b-handoff', cat: 'B2B 문의', title: 'B2B팀 인계', types: ['B2B/도매'],
    after: '종결',
    forward: 'global_sales@neosimplix.com',
    action: 'B2B팀 메일(global_sales@neosimplix.com)로 이 메일 포워드 + B2B팀에 노티',
    body: hi(`Thank you very much for your interest in our brand.
We truly appreciate your inquiry regarding a potential distribution or B2B partnership.
For all distribution and wholesale-related inquiries, we kindly ask that you contact our B2B team directly at global_sales@neosimplix.com.
They will carefully review your proposal and reach out to you should there be an opportunity for further discussion.
Thank you for your understanding and interest in working with us. We look forward to the possibility of collaborating with you in the future.`),
  },

  // ---------- 크리에이터 협업 ----------
  {
    id: 'm-creator-details', cat: '크리에이터 협업', title: '디테일 요청', types: ['제휴/인플루언서'],
    after: '진행중',
    body: hi(`Thank you so much for reaching out to Dr.Reju-All! We love the idea of collaborating with creators who are passionate about skincare and creating genuine, high-quality content.
We'd love to learn more about your audience and the type of content you typically create.
Could you share some details such as your follower count, average views, and the demographics of your audience?
It would also be wonderful to see a few examples of your past brand collaborations or skincare content if you have any.
We look forward to potentially working together and will be in touch once we've had a chance to review your profile.`),
  },
  {
    id: 'm-creator-handoff', cat: '크리에이터 협업', title: '마케팅팀 인계', types: ['제휴/인플루언서'],
    after: '종결',
    action: '마이크로 크리에이터면 CG파트에 계정·디테일 전달',
    body: hi(`Thank you so much for reaching out to us and for your collaboration proposal.
We'll share your information with our marketing team for review, and we truly hope we'll have the opportunity to work with you in the future. :)
If they are interested in collaborating with you, they will follow up with you directly.
Thank you again for your interest in our brand. We truly appreciate it!`),
  },

  // ---------- 주문 취소 ----------
  {
    id: 'm-cancel-fraud', cat: '주문 취소', title: '왜 취소됐나요 (fraud filter)', types: ['주문/결제'],
    body: hi(`Thank you for reaching out, and we completely understand your frustration. We sincerely apologize for the cancellation of your order {order} and for the confusion this may have caused.
Your order was unfortunately canceled due to an unforeseen issue on our end.
The issue may be one of the following :
- Billing street address doesn't match credit card's registered address
- Billing address ZIP or postal code doesn't match credit card's registered address
- Card Verification Value (CVV) is incorrect
Please rest assured that if any payment was charged, a full refund will be processed back to your original payment method within 5–7 business days.
If you have not yet received a refund, please don't hesitate to let us know and we will prioritize this immediately.
We would love the opportunity to make this right for you. If you'd like, we can help you place a new order and ensure it is fulfilled without any issues.
Once again, we are truly sorry for this experience and appreciate your patience and understanding.`),
  },
  {
    id: 'm-cancel-refund-pending', cat: '주문 취소', title: '취소됐는데 돈이 안 들어옴', types: ['주문/결제', '교환/환불'],
    body: hi(`Thank you for reaching out regarding your order {order}.
We sincerely apologize for the cancellation and for any inconvenience this may have caused.
After checking your order, we confirmed that your refund is already being processed. However, depending on your card issuer or payment provider, it may take a little longer for the refunded amount to appear in your account.
We sincerely apologize for the delay and kindly ask for your patience and understanding.
If you have any other questions, please don't hesitate to contact us.`),
  },
  {
    id: 'm-cancel-done', cat: '주문 취소', title: '취소 완료 (배송 시작 전)', types: ['주문/결제'],
    after: '종결',
    action: 'MCF 취소 완료 확인 후 Shopify에서 Cancel order',
    body: hi(`Thank you so much for your patience while we looked into your cancellation request.
We checked the status of your order, and fortunately, your shipment was still marked as "Awaiting Pickup by Assigned Carrier." Since it had not yet been picked up by the carrier, we were able to cancel the shipment before it left our fulfillment center.
As a result, your order has been successfully canceled. We are glad we were able to process your request before the shipment was dispatched.
We sincerely appreciate your understanding throughout this process. If you have any other questions or if there is anything else we can help you with, please don't hesitate to reach out. We are always happy to assist you.
Thank you again, and we hope to have the opportunity to serve you again in the future.`),
  },
  {
    id: 'm-cancel-shipped', cat: '주문 취소', title: '취소 불가 (배송 시작됨)', types: ['주문/결제'],
    action: '제품 수령 후에도 취소를 원하면 리턴 프로세스 안내',
    body: hi(`Thank you for your patience while we checked the status of your order.
After reviewing your shipment, we found that it has already been dispatched and is currently in transit. Unfortunately, once an order has been shipped, we are no longer able to cancel it.
We sincerely apologize for any inconvenience this may cause.
If you still wish to cancel your order after receiving the package, we would be happy to assist you with the return process. Simply let us know once the order has been delivered, and we will provide you with detailed return instructions and guide you through each step of the process.
If you have any questions or need any further assistance in the meantime, please don't hesitate to contact us. We're always happy to help.
Thank you for your understanding and patience.`),
  },

  // ---------- 주소 변경 ----------
  {
    id: 'm-address-done', cat: '주소 변경', title: '주소 변경 완료', types: ['배송', '주문/결제'],
    after: '종결',
    action: 'Shopify에서 Shipping Address 변경',
    body: hi(`Thank you for reaching out! We're sorry to hear that the wrong address was used for your order.
Fortunately, your order {order} had not yet been shipped, so we were able to cancel the shipment to your original address.
We have arranged a new shipment to the updated address you provided :
[변경 주소]
I have updated your shipping address to the new address you provided and arranged the shipment accordingly.
Your order has now been dispatched, so we are unfortunately unable to make any further changes to the shipping address.
Thank you for your understanding, and we hope your order arrives safely.`),
  },
  {
    id: 'm-address-shipped', cat: '주소 변경', title: '주소 변경 불가 (배송 중)', types: ['배송', '주문/결제'],
    body: hi(`Unfortunately, your order has already been shipped and is currently in transit, so we are no longer able to modify the shipping address.
We sincerely apologize for the inconvenience and appreciate your understanding. We recommend monitoring the tracking information and, if possible, contacting the carrier directly to see if any delivery options are available.
If you have any other questions, please feel free to let us know.`),
  },

  // ---------- 반품 ----------
  {
    id: 'm-return-confirm', cat: '반품', title: '반품할 제품 확인', types: ['교환/환불'],
    after: '진행중',
    body: hi(`Thank you for reaching out, and we're sorry to hear that you want to return the items.
We'd like to process a return for you as quickly as possible. Before we generate your return label, could you please confirm which product you'd like to return from order {order}?
Once we have your confirmation, we'll send over the return label right away.
Thank you for your patience, and we apologize again for the inconvenience.`),
  },
  {
    id: 'm-return-label', cat: '반품', title: '리턴 라벨 전달', types: ['교환/환불'],
    after: '진행중',
    action: 'Return 접수 후 Return Label 생성 → 라벨을 고객에게 이메일로 따로 한 번 더 발송',
    body: hi(`Thank you for your purchase and for reaching out to us.
We have reviewed the email address and order information you provided, and we have submitted a return request for the [반품된 제품].
We are sending you a prepaid return label. Please print the label and attach it securely to the outside of the package.
USPS will pick up the package according to the return instructions provided with the label.
Once we receive and verify the returned items, we will process your refund to the original payment method as soon as possible.
If you have any questions during the return process, please feel free to contact us.
Thank you for your cooperation.`),
  },
  {
    id: 'm-return-refund', cat: '반품', title: '반품 수령 후 환불 안내', types: ['교환/환불'],
    action: 'Refund 진행',
    body: hi(`We're glad to confirm that your returned items have been received.
We have checked that you received [반품된 제품], and your refund is currently being processed back to your original payment method.
Refunds typically take 7-10 business days to appear on your statement, depending on your bank or card issuer.
We sincerely appreciate your patience throughout this process.
If you have any further questions or don't see the refund reflected within that timeframe, please don't hesitate to reach out and we'll be happy to assist.`),
  },

  // ---------- 배송 ----------
  {
    id: 'm-ship-stuck', cat: '배송', title: '배송 멈춤 (아마존 배송 문제)', types: ['배송'],
    after: '진행중',
    action: '아마존 케이스 생성 → 기존 배송 취소 후 재발송',
    body: hi(`I checked your order {order} and the tracking number [기존 트래킹넘버].
We are using Amazon Shipping for this order, and according to the tracking information, [최근 업데이트]
However, there have been no tracking updates since [업데이트 멈춘 날짜]. In cases like this, it is typically due to an issue within the Amazon Shipping system.
To make sure you receive your order as soon as possible, we will cancel the original shipment and send you a replacement right away.
We sincerely apologize for the inconvenience and appreciate your patience and understanding.`),
  },
  {
    id: 'm-ship-split', cat: '배송', title: '제품 누락 (따로 배송됨)', types: ['배송'],
    action: 'Partially Fulfilled 상태면 나머지도 Request fulfill',
    body: hi(`Thank you for reaching out.
We apologize for the confusion. Due to a shipping issue during fulfillment, your order was split into two separate shipments, which is why you received separately.
We have checked the tracking information and can confirm that the shipment containing rest of the items you ordered were successfully delivered on [배송완료일자].
Thank you for your patience and understanding!`),
  },
  {
    id: 'm-ship-missing-check', cat: '배송', title: '제품 누락 (1차 확인)', types: ['배송', '교환/환불'],
    after: '진행중',
    action: '1차로 사실 확인 → 그래도 진짜 안 왔다고 하면 그때 추가 발송',
    body: hi(`We're truly sorry to hear that the [누락된 제품] was not included in your package. This is certainly not the experience we want for our customers, and we completely understand how frustrating this must be.
Ship date: [배송시작일자]
Delivery Date: [배송완료일자]
Tracking Number: [트래킹넘버]
Carrier: UPS
We are looking into this matter right away. To help us resolve this as quickly as possible, could you please:
1. Confirm the items that were missing
2. Let us know if the outer packaging showed any signs of damage upon arrival
We will do our best to ship out the missing items to you as soon as possible. Please rest assured that we take full responsibility for this and will make it right for you.
Thank you for your patience and understanding. We truly value your business and are committed to ensuring your satisfaction.`),
  },
  {
    id: 'm-ship-missing-reship', cat: '배송', title: '제품 누락 재발송 (MCF)', types: ['배송', '교환/환불'],
    after: '진행중',
    action: 'Amazon Create MCF → CS_MCF 탭에 기재 (Order ID 꼭 쓸 것)',
    body: hi(`Thank you for confirming the issue. We sincerely apologize once again for the inconvenience this has caused.
To resolve the matter, we will arrange to reship the missing [누락된 제품] to you as soon as possible.
Our team is working to process the replacement promptly so that you can receive it without unnecessary delay.
We truly appreciate your patience and understanding while we make this right.
Thank you for your continued support of our brand, and please do not hesitate to reach out if you have any further questions or concerns.`),
  },
  {
    id: 'm-ship-reship-tracking', cat: '배송', title: '재발송 트래킹 넘버 문의', types: ['배송'],
    body: hi(`Thank you so much for your kind words — we're really glad we could help!
Regarding the reshipping of your [누락된 제품], your products have already been shipped and are currently in transit.
You can track the latest delivery status using the tracking information below:
Tracking Number: [새로운 트래킹넘버]
Carrier: USPS
Please use the tracking number to check for the most up-to-date shipping status. We appreciate your patience and hope your package arrives soon!`),
  },
  {
    id: 'm-ship-fee-hawaii', cat: '배송', title: '배송비 항의 (하와이 등)', types: ['배송', '주문/결제'],
    action: '환불이 필요한 특수 상황(첫 구매, 불만 강도 큼 등)이면 컨펌 후 배송비 환불 + 안내 멘트',
    body: hi(`Thank you so much for reaching out, and we're sorry for any confusion around the shipping charge — we completely understand how it could have caught you off guard, and we're happy to explain.
As noted in the banner at the top of our website, our free shipping offer for orders over $30 applies to free ground shipping. Hawaii, unfortunately, can't be reached by ground transport, so deliveries there require air or sea freight — and that's why a separate shipping fee applies to these regions.
We truly appreciate your patience and understanding, and we're always here if there's anything else we can help clarify.`),
  },
  {
    id: 'm-amazon-replacement', cat: '배송', title: '아마존 주문 불량·분실 교체 (정보 요청)', types: ['배송', '교환/환불'],
    after: '진행중',
    body: hi(`We sincerely apologize for the inconvenience caused by [사유]
It appears that [사유], and we would like to arrange a replacement for you right away.
However, since your order was placed through Amazon, we are unable to access your personal information, including your shipping details, due to Amazon's privacy policies.
To proceed with the replacement, could you kindly provide the following information?

Full Name:

Full Shipping Address:

Phone Number:

Once we receive these details, we will arrange for a replacement to be shipped to you as soon as possible.
We sincerely apologize again for the inconvenience and truly appreciate your patience and understanding.`),
  },
  {
    id: 'm-amazon-cs', cat: '배송', title: '아마존 고객센터로 안내', types: ['배송', '교환/환불'],
    after: '종결',
    body: hi(`We sincerely apologize for the inconvenience caused by what appears to have been a shipping error.

Based on the order number you provided, it appears that your order was placed through Amazon.

As we entrust Amazon with the shipping and fulfillment of all Amazon orders, we kindly recommend contacting Amazon Customer Service directly. They should be able to assist you with arranging a replacement.

We sincerely apologize that we are unable to assist you directly with this matter and appreciate your understanding.`),
  },
  {
    id: 'm-amazon-fulfillment', cat: '배송', title: '아마존 창고·배송 문제 (교체 발송)', types: ['배송', '교환/환불'],
    after: '진행중',
    body: hi(`We sincerely apologize for the inconvenience this has caused.

As we use Amazon's warehouses and fulfillment services for our orders, it appears that an issue may have occurred during the shipping process.

We will arrange to send you a replacement right away.

Once again, we sincerely apologize for the inconvenience and truly appreciate your patience and understanding.`),
  },

  // ---------- 환불 ----------
  {
    id: 'm-refund-pending', cat: '환불', title: '취소했는데 환불이 안 들어옴', types: ['교환/환불', '주문/결제'],
    body: hi(`Thank you for following up regarding your order {order}. We sincerely apologize for the cancellation and for the delay in processing your refund.
We completely understand how frustrating this must be, and we want to assure you that your refund of [환불액] USD is being processed.
Refunds typically take 5–7 business days to appear on your original payment method, though some banks or payment providers may take up to 10 business days.
If you do not see the refund within that timeframe, please do not hesitate to contact us and we will escalate this immediately to ensure it is resolved as quickly as possible.
We are truly sorry for the inconvenience and appreciate your patience.`),
  },

  // ---------- 해외 구매 · 사칭 ----------
  {
    id: 'm-global-buy', cat: '해외 구매 · 사칭', title: '기타 국가 구매 방법 (역직구몰 안내)', types: ['주문/결제', '제품 문의', '기타'],
    after: '종결',
    body: hi(`Thank you for your interest in our brand.
Unfortunately, we are unable to manually arrange international shipments to other countries. Instead, we would like to recommend a purchasing channel that is available in your country.
The retailer below is an official partner authorized to sell our products, so we recommend purchasing through this channel to ensure you receive genuine products.
https://www.stylekorean.com
If you are considering purchasing from other websites in your country, please feel free to send us the links.
We would be happy to check whether they are authorized sellers of our brand and help you verify their authenticity before you make a purchase.
If you have any other questions, please feel free to reach out.`),
  },
  {
    id: 'm-fraud-site', cat: '해외 구매 · 사칭', title: '사칭 사이트 주문', types: ['정품 인증', '주문/결제'],
    after: '종결',
    body: hi(`After reviewing the information you provided, it appears that your order may have been placed through an unauthorized or potentially fraudulent website.
To help protect you from any possible issues, we strongly recommend cancelling your order as soon as possible and requesting a refund from the seller if you have not already done so.
For future purchases, please use our official website to ensure that you receive genuine products and reliable customer support:
https://drrejuall.com/`),
  },

  // ---------- 제품 ----------
  {
    id: 'm-vegan', cat: '제품', title: '비건 여부', types: ['제품 문의'],
    after: '종결',
    action: '비건·할랄 공식 인증 미보유',
    body: hi(`Thank you for reaching out, and for your kind interest in our brand!
At this time, we don't have any officially certified vegan products, so we're not able to label our products as "vegan." Please note that most of our products do contain marine-derived ingredients (from salmon), such as PDRN and Hydrolyzed Collagen.
The one exception in terms of formulation is our Retino-Mela Serum, which does not contain animal-derived ingredients based on its full ingredient list — though please note this is not a certified vegan claim.
If having a certified vegan product is important to you, we'd be glad to pass your interest along to our team.`),
  },
  {
    id: 'm-ingredient-source', cat: '제품', title: '원료 출처 (PDRN·콜라겐)', types: ['제품 문의'],
    after: '종결',
    body: hi(`Thank you for reaching out, and for your interest in our products!

The only animal-derived ingredients we use come from fish (salmon) — specifically PDRN (Sodium DNA) and Hydrolyzed Collagen, which is a marine collagen. We don't use anything derived from land animals such as pork, cattle, goat, or chicken, and all of our products are BSE-free. Peptides such as Copper Tripeptide-1 are synthetic.

If you have any specific certification or allergy concerns, please let us know — we're happy to look into it further for you.`),
  },
  {
    id: 'm-defective', cat: '제품', title: '제품 불량 (구매처·주문번호 확인)', types: ['교환/환불', '제품 문의'],
    after: '진행중',
    body: hi(`We're sorry to hear that the [제품명] you purchased appears to be defective.

We'd be happy to help arrange a replacement. Could you please provide the following information so we can verify your purchase?

- Where you purchased the product
- Order Number

Once we receive these details, we'll assist you with the replacement as soon as possible.

We apologize for the inconvenience and appreciate your understanding.`),
  },
  {
    id: 'm-cruelty-free', cat: '제품', title: 'Cruelty-free (동물실험)', types: ['제품 문의'],
    after: '종결',
    body: hi(`We're happy to confirm that all Dr.Reju-All products are BSE FREE and NON ANIMAL TESTING (Cruelty-Free).
This means that no animal testing is conducted on either our finished products or the ingredients used in our formulations.
Please note that while our products are cruelty-free, some do contain fish-derived ingredients and are therefore not considered vegan.
We hope this helps clarify your concerns! If you have any further questions, please don't hesitate to reach out.`),
  },

  // ---------- 구독 ----------
  {
    id: 'm-unsubscribe', cat: '구독', title: '메일 구독 취소 요청', types: ['기타', '스팸/광고'],
    after: '종결',
    action: 'Shopify Customers → 해당 고객 → Edit marketing status → Subscribed 끄기',
    body: hi(`Thank you for reaching out, and for having been part of the Dr.Reju-All community.
Your subscription has been successfully cancelled, so you won't be charged or receive any further recurring shipments. We're sorry to see you go, and we completely respect your decision.
If there's ever anything we could have done better, we'd truly love to hear it — no pressure at all. Should you wish to return, we'll be happy to welcome you back!`),
  },
];
