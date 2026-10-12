# CS Dashboard - Dr.Reju-All

Gmail + GitHub 통합 CS 대시보드

## 기능

- 📧 **Gmail 자동 연동**: global_md@drrejuall.com의 CS 메일 자동 수집
- 📊 **유형별 분류**: 배송, 인증, 제휴, 환불, 기타
- 🏷️ **라벨별 분류**: 긴급, 신규, Follow-up
- 🔍 **검색 및 필터**: 고객명, 주제로 검색
- 🔗 **GitHub 통합**: 준비 중 (Issues/PRs 추가 예정)

## 설정

### 1. Google OAuth 설정

**Google API Console에서:**
- Gmail API 활성화
- OAuth 2.0 인증정보 생성
- Redirect URI 추가: `https://reju-cs-dashboard.vercel.app/api/cs-gmail?action=callback`

### 2. Vercel 배포

```bash
# 레포지토리 클론
git clone https://github.com/[YOUR_USERNAME]/reju-cs-dashboard
cd reju-cs-dashboard

# Vercel 배포
vercel --prod
```

### 3. 환경 변수 설정

Vercel 프로젝트에 다음 환경변수 추가:

```
GOOGLE_CLIENT_ID=768102495846-p8f4pul3jn0rbkqvcujehmus2i8a1sjk.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
REDIRECT_URI=https://reju-cs-dashboard.vercel.app/api/cs-gmail?action=callback
```

## 사용 방법

1. 대시보드 접속
2. "Gmail 연동" 버튼 클릭
3. Google 계정 로그인
4. 권한 허용
5. 자동으로 CS 메일 로드

## 프로젝트 구조

```
reju-cs-dashboard/
├── api/
│   └── cs-gmail.js          # Gmail OAuth + API 함수
├── public/
│   └── index.html           # Canvas 대시보드 UI
├── package.json
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

## API 엔드포인트

- `GET /api/cs-gmail?action=auth` - OAuth URL 반환
- `GET /api/cs-gmail?action=callback&code=...` - 토큰 교환
- `GET /api/cs-gmail?action=emails&token=...` - 메일 조회

## 다음 단계

- [ ] GitHub Issues/PRs 통합
- [ ] Firestore 데이터 저장
- [ ] 월별/주별 통계
- [ ] 자동 응답 템플릿
