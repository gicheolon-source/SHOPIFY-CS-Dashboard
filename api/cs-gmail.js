module.exports = async function handler(req, res) {
  const action = req.query.action;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // OAuth URL 생성
  if (action === 'auth') {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = `${process.env.REDIRECT_URI || 'https://shopify-cs-dashboard.vercel.app'}/api/cs-gmail?action=callback`;
    const scope = 'https://www.googleapis.com/auth/gmail.readonly';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    return res.json({ url: authUrl });
  }

  // OAuth 콜백
  if (action === 'callback') {
    const code = req.query.code;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = `${process.env.REDIRECT_URI || 'https://shopify-cs-dashboard.vercel.app'}/api/cs-gmail?action=callback`;

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&grant_type=authorization_code`
      });

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      if (accessToken) {
        return res.redirect(`/?token=${encodeURIComponent(accessToken)}`);
      } else {
        return res.status(401).json({ error: 'Token exchange failed' });
      }
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Gmail 메일 조회
  if (action === 'emails') {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    try {
      // Gmail API: INBOX 메일 조회
      const mailResponse = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?q=from:global_md@drrejuall.com&maxResults=50',
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!mailResponse.ok) {
        throw new Error(`Gmail API error: ${mailResponse.status}`);
      }

      const mailData = await mailResponse.json();
      const messages = mailData.messages || [];

      // 메시지 상세 조회
      const emails = await Promise.all(
        messages.slice(0, 20).map(async (msg) => {
          try {
            const msgResponse = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            const msgData = await msgResponse.json();
            const headers = msgData.payload?.headers || [];

            const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
            const subject = getHeader('Subject');
            const from = getHeader('From');
            const date = getHeader('Date');

            // 간단한 파싱 (실제로는 더 정교해야 함)
            const typeMap = {
              '배송': ['배송', 'shipping', 'delivery', '운송'],
              '인증': ['인증', 'verify', 'authentic'],
              '제휴': ['제휴', 'partner', 'affiliate'],
              '환불': ['환불', 'refund', 'return'],
            };

            let type = '기타';
            for (const [t, keywords] of Object.entries(typeMap)) {
              if (keywords.some(k => subject.toLowerCase().includes(k))) {
                type = t;
                break;
              }
            }

            const labelMap = {
              '긴급': ['urgent', '긴급', 'asap'],
              '신규': ['new', '신규'],
              'Follow-up': ['follow', '재', 'check']
            };

            let label = '신규';
            for (const [l, keywords] of Object.entries(labelMap)) {
              if (keywords.some(k => (subject + from).toLowerCase().includes(k))) {
                label = l;
                break;
              }
            }

            const dateObj = new Date(date);
            const dateStr = dateObj.toISOString().split('T')[0];

            return {
              id: msg.id,
              date: dateStr,
              customer: from.split('<')[0].trim() || '고객',
              subject: subject || '(제목 없음)',
              type: type,
              label: label,
              from: from
            };
          } catch (e) {
            return null;
          }
        })
      );

      const validEmails = emails.filter(e => e !== null);
      return res.json({ emails: validEmails });
    } catch (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Invalid action' });
};
