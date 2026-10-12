const { google } = require('googleapis');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/api/cs-gmail?action=callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Gmail API 인스턴스
const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

// 유형 분류 (제목/라벨에서 자동 감지)
function detectType(subject, labels) {
  const subjectLower = subject.toLowerCase();
  const labelStr = (labels || []).join('|').toLowerCase();
  const combined = subjectLower + '|' + labelStr;

  if (combined.includes('ship') || combined.includes('배송') || combined.includes('delivery')) return '배송';
  if (combined.includes('auth') || combined.includes('인증') || combined.includes('authentic')) return '인증';
  if (combined.includes('affiliate') || combined.includes('제휴') || combined.includes('partner')) return '제휴';
  if (combined.includes('refund') || combined.includes('환불') || combined.includes('return')) return '환불';
  return '기타';
}

// 라벨 분류 (Gmail 라벨에서)
function detectLabel(gmailLabels) {
  if (!gmailLabels || gmailLabels.length === 0) return '신규';
  const labels = gmailLabels.join('|').toLowerCase();

  if (labels.includes('urgent') || labels.includes('긴급')) return '긴급';
  if (labels.includes('follow') || labels.includes('follow-up')) return 'Follow-up';
  return '신규';
}

// OAuth URL 생성
function getAuthUrl() {
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly'
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });

  return url;
}

// 토큰 교환
async function getTokenFromCode(code) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens.access_token;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

// Gmail에서 메일 조회
async function fetchEmails(accessToken) {
  try {
    oauth2Client.setCredentials({
      access_token: accessToken
    });

    // 최근 20개 메일 조회
    const result = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 20,
      q: 'from:global_md@drrejuall.com'
    });

    const messages = result.data.messages || [];
    const emails = [];

    for (const message of messages) {
      try {
        const msg = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const headers = msg.data.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find(h => h.name === 'From')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';
        const labels = msg.data.labelIds || [];

        // 고객명 추출 (from 필드에서)
        const fromMatch = from.match(/([^<]+)</);
        const customer = fromMatch ? fromMatch[1].trim() : from.split('@')[0];

        // 날짜 포맷 (YYYY-MM-DD)
        const dateObj = new Date(date);
        const formattedDate = dateObj.toISOString().split('T')[0];

        emails.push({
          id: message.id,
          date: formattedDate,
          from: from,
          customer: customer,
          subject: subject,
          type: detectType(subject, labels),
          label: detectLabel(labels),
          snippet: msg.data.snippet || ''
        });
      } catch (err) {
        console.error(`Error processing message ${message.id}:`, err);
      }
    }

    return emails;
  } catch (error) {
    console.error('Fetch emails error:', error);
    throw error;
  }
}

// API Handler
export default async function handler(req, res) {
  const { action } = req.query;

  try {
    if (action === 'auth') {
      // OAuth URL 반환
      const url = getAuthUrl();
      return res.status(200).json({ url });
    }

    if (action === 'callback') {
      // OAuth 콜백
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'No code provided' });
      }

      const token = await getTokenFromCode(code);
      // 프론트에서 이 토큰을 localStorage에 저장하고 사용
      return res.status(200).json({ token, message: 'Authorization successful' });
    }

    if (action === 'emails') {
      // 메일 조회
      const { token } = req.query;
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      const emails = await fetchEmails(token);
      return res.status(200).json({ emails });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
