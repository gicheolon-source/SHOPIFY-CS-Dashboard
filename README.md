# Reju-All CS Desk

Dr.Reju-All 글로벌 Shopify 스토어의 고객 문의(Gmail)를 팀이 함께 처리하는 대시보드.

- **인박스**: CS 메일함 스레드를 가져와 Claude가 유형·우선순위·한 줄 요약을 자동으로 붙임. 처리 상태(미처리/진행중/답변완료/종결)와 담당자, 내부 메모, 처리 이력을 팀이 공유
- **Shopify 주문 조회**: 문의한 고객 이메일과 본문의 주문번호(#1234)로 주문·결제·배송·송장·환불 내역을 옆에 표시
- **AI 답장 초안**: 대화 내용 + 주문 정보 + 설정의 CS 가이드를 바탕으로 고객 언어로 초안 작성(한국어 번역·확인할 점 포함). Gmail 임시보관함 저장 또는 바로 발송
- **통계**: 일별 접수량, 유형별 비중, 첫 응답 시간(중앙값/평균), 24시간 내 응답률, 담당자별 처리량

## 구조

```
api/            Vercel 서버리스 함수 (9개)
  auth.js         팀 로그인(공용 비밀번호) / 세션 정보
  google.js       Gmail OAuth 연결 (팀 공용 1회)
  threads.js      티켓 목록 / Gmail 동기화 + 자동 분류
  thread.js       스레드 본문 / 상태·담당자·메모 변경
  shopify.js      주문 조회
  ai.js           답장 초안
  send.js         답장 발송 / 임시보관함 저장
  stats.js        통계
  settings.js     검색식·별칭·CS 가이드·서명
lib/            공통 로직 (Gmail REST, Shopify GraphQL, Claude, Blob 저장소)
public/         화면 (빌드 없는 HTML/CSS/JS)
dev/server.mjs  로컬 개발 서버
```

저장소는 Vercel Blob(private) `shopify-cs-store`:
`cs/tickets.json`(티켓 상태), `cs/settings.json`, `cs/google.json`(refresh token, AES-GCM 암호화).

## 환경변수 (Vercel)

| 이름 | 설명 |
|---|---|
| `DASH_USER` | 팀 공용 로그인 아이디 |
| `DASH_PASSWORD` | 팀 공용 로그인 비밀번호 (아이디·비밀번호를 바꾸면 기존 로그인이 모두 풀림) |
| `DASH_SECRET` | 세션 서명·토큰 암호화 키 (바꾸면 Gmail 재연결 필요) |
| `SLACK_WEBHOOK_URL` | (선택) 슬랙 Incoming Webhook — 긴급·24시간 미답변·배정 알림, 매일 아침 요약 |
| `CRON_SECRET` | 매일 09:00 KST Vercel Cron(`/api/stats?digest=1`: 자동 동기화 + 슬랙 요약) 인증 |
| `APP_URL` | (선택) 슬랙 링크용 대시보드 주소. 없으면 Vercel 프로덕션 주소 |
| `SHOPIFY_ORDER_PREFIX` | (선택) 주문번호 접두사, 기본 `DR` (DR#15409) |
| `TEAM_MEMBERS` | (선택) `Josh,Sophie,...` — 설정하면 로그인 시 이름을 목록에서 고름 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 |
| `GOOGLE_REDIRECT_URI` | (선택) 기본값 `https://<도메인>/oauth/google/callback` |
| `ANTHROPIC_API_KEY` | Claude 분류·초안. 없으면 키워드 분류 + 기본 템플릿 |
| `CLAUDE_MODEL` | (선택) 기본 `claude-opus-5-5` |
| `SHOPIFY_STORE_DOMAIN` | `xxx.myshopify.com` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API 토큰(`shpat_...`, 권한 `read_orders`, `read_customers`) |
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | 토큰 대신 Dev Dashboard 앱의 client credentials 사용 시 |
| `BLOB_READ_WRITE_TOKEN` | Blob 스토어 연결 시 자동 설정 |

### Google OAuth 설정

Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트에
승인된 리디렉션 URI `https://shopify-cs-dashboard.vercel.app/oauth/google/callback` 추가.
Gmail API 사용 설정, 범위는 `gmail.modify`(읽기·라벨·초안·발송).
대시보드 로그인 후 **Gmail 연결**을 CS 메일 계정(global_md@drrejuall.com)으로 한 번만 하면 팀 전체가 사용.

## 로컬 실행

```bash
npm install
npm run demo   # 가짜 데이터로 화면 확인 (비밀번호: demo) → http://localhost:3200
npm run dev    # .env.local 사용
```
