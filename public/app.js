/* Reju-All CS Desk — 프론트엔드 (빌드 없음, 바닐라 JS) */
(() => {
  'use strict';

  const STATUSES = ['미처리', '진행중', '답변완료', '종결'];
  const TYPES = ['배송', '교환/환불', '제품 문의', '주문/결제', '피부 트러블', '정품 인증', '제휴/인플루언서', 'B2B/도매', '스팸/광고', '기타'];
  const PRIORITIES = ['긴급', '보통', '낮음'];
  const OPEN = new Set(['미처리', '진행중']);
  const STATUS_CHIP = { 미처리: 'danger', 진행중: 'warn', 답변완료: 'ok', 종결: '' };
  const TYPE_CHIP = { 배송: 'info', '교환/환불': 'warn', '피부 트러블': 'danger', '정품 인증': 'warn', '제휴/인플루언서': 'accent', 'B2B/도매': 'accent' };

  const S = {
    me: null,
    tickets: [],
    syncedAt: 0,
    syncedBy: null,
    syncing: false,
    view: 'inbox',
    filter: { status: 'open', type: '', assignee: '', q: '', sort: 'recent', quick: '' },
    selected: null,
    detail: null,
    orders: null,
    composer: { text: '', ko: '', notes: '', instruction: '', loading: false, sending: false },
    expanded: new Set(),
    stats: null,
    days: 30,
    settings: null,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const app = () => $('#app');

  // ---------- 유틸 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = (text) => esc(text).replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  const initial = (name) => esc(String(name || '?').trim().charAt(0).toUpperCase());

  function ago(ms) {
    if (!ms) return '';
    const diff = (Date.now() - ms) / 1000;
    if (diff < 60) return '방금';
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
    return new Date(ms).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
  const fullDate = (ms) => new Date(ms).toLocaleString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
  const hours = (h) => (h == null ? '–' : h < 1 ? `${Math.round(h * 60)}분` : h < 48 ? `${h.toFixed(1)}시간` : `${(h / 24).toFixed(1)}일`);

  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.code === 'AUTH') {
      S.me = null;
      renderLogin();
      throw new Error(data.error);
    }
    if (!res.ok) {
      const err = new Error(data.error || `요청 실패 (${res.status})`);
      err.code = data.code;
      throw err;
    }
    return data;
  }

  const icon = {
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
    spark: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
    mail: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    clip: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/></svg>',
  };

  // ---------- 로그인 ----------
  function renderLogin(members = S.members || []) {
    app().innerHTML = `
      <div class="login">
        <form class="login-card" id="login-form">
          <div class="brand-mark">R</div>
          <div>
            <h1>Reju-All CS Desk</h1>
            <div class="hint">Dr.Reju-All 글로벌 스토어 고객문의 대시보드</div>
          </div>
          <label class="field">이름
            ${members.length
              ? `<select class="select" name="name" style="width:100%">${members.map((m) => `<option>${esc(m)}</option>`).join('')}</select>`
              : '<input class="input" name="name" autocomplete="username" placeholder="예: Josh" required>'}
          </label>
          <label class="field">팀 비밀번호
            <input class="input" name="password" type="password" autocomplete="current-password" required>
          </label>
          <div class="error-text" id="login-error"></div>
          <button class="btn primary" type="submit" style="justify-content:center;height:40px">로그인</button>
        </form>
      </div>`;
    try {
      const last = localStorage.getItem('cs_last_name');
      if (last) $('[name=name]').value = last;
    } catch {}
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await api('/api/auth', { method: 'POST', body: { action: 'login', name: f.get('name'), password: f.get('password') } });
        try { localStorage.setItem('cs_last_name', f.get('name')); } catch {}
        await boot();
      } catch (err) {
        $('#login-error').textContent = err.message;
        btn.disabled = false;
      }
    });
  }

  // ---------- 셸 ----------
  function renderShell() {
    const g = S.me.google;
    let banner = '';
    if (!g.configured) banner = '<div class="banner">Google OAuth 환경변수(GOOGLE_CLIENT_ID/SECRET)가 없습니다. Vercel 환경변수를 확인해 주세요.</div>';
    else if (!g.connected) banner = `<div class="banner">${g.broken ? 'Gmail 연결이 만료되었습니다.' : 'CS 메일함(Gmail)이 아직 연결되지 않았습니다.'} 팀에서 한 명만 연결하면 모두 함께 씁니다. <a class="btn sm" href="/api/google?action=start">Gmail 연결</a></div>`;
    if (S.me.demo) banner = '<div class="banner">데모 모드 — 가짜 데이터로 화면만 확인 중입니다. 실제 메일은 발송되지 않습니다.</div>';
    app().innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand"><div class="brand-mark">R</div><span>CS Desk</span></div>
          <nav class="tabs">
            ${[['inbox', '인박스'], ['stats', '통계'], ['settings', '설정']].map(([k, l]) => `<button class="tab ${S.view === k ? 'active' : ''}" data-action="view" data-view="${k}">${l}</button>`).join('')}
          </nav>
          <div class="spacer"></div>
          <span class="sync-info" id="sync-info"></span>
          <button class="btn sm" data-action="sync" id="sync-btn" title="Gmail에서 새 메일 가져오기">${icon.refresh}<span>동기화</span></button>
          <div class="me"><div class="avatar">${initial(S.me.user.name)}</div><span class="name">${esc(S.me.user.name)}</span></div>
          <button class="btn sm ghost" data-action="logout">로그아웃</button>
        </header>
        ${banner}
        <main class="view" id="view"></main>
      </div>`;
    renderSyncInfo();
    renderView();
  }

  function renderSyncInfo() {
    const el = $('#sync-info');
    if (!el) return;
    el.textContent = S.syncing ? 'Gmail 동기화 중…' : S.syncedAt ? `${ago(S.syncedAt)} 동기화` : '';
    const btn = $('#sync-btn');
    if (btn) {
      btn.disabled = S.syncing;
      btn.innerHTML = `${S.syncing ? '<span class="spin"></span>' : icon.refresh}<span>동기화</span>`;
    }
  }

  function renderView() {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === S.view));
    if (S.view === 'inbox') renderInbox();
    else if (S.view === 'stats') renderStats();
    else renderSettings();
  }

  // ---------- 인박스 ----------
  function counts() {
    const c = { open: 0, all: S.tickets.length, needReply: 0, urgent: 0, mine: 0, today: 0 };
    for (const s of STATUSES) c[s] = 0;
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    for (const t of S.tickets) {
      c[t.status] = (c[t.status] || 0) + 1;
      if (OPEN.has(t.status)) {
        c.open++;
        if (t.lastFromCustomer && t.type !== '스팸/광고') c.needReply++;
        if (t.priority === '긴급') c.urgent++;
        if (t.assignee === S.me.user.name) c.mine++;
      }
      if (t.firstAt >= startOfDay) c.today++;
    }
    return c;
  }

  function filtered() {
    const f = S.filter;
    const q = f.q.trim().toLowerCase();
    let list = S.tickets.filter((t) => {
      if (f.status === 'open' && !OPEN.has(t.status)) return false;
      if (STATUSES.includes(f.status) && t.status !== f.status) return false;
      if (f.quick === 'needReply' && !(OPEN.has(t.status) && t.lastFromCustomer && t.type !== '스팸/광고')) return false;
      if (f.quick === 'urgent' && !(OPEN.has(t.status) && t.priority === '긴급')) return false;
      if (f.quick === 'mine' && !(OPEN.has(t.status) && t.assignee === S.me.user.name)) return false;
      if (f.type && t.type !== f.type) return false;
      if (f.assignee === '__none' && t.assignee) return false;
      if (f.assignee && f.assignee !== '__none' && t.assignee !== f.assignee) return false;
      if (q) {
        const hay = `${t.customer?.name} ${t.customer?.email} ${t.subject} ${t.summary} ${t.snippet} ${(t.orderRefs || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const pri = (t) => (t.priority === '긴급' && OPEN.has(t.status) ? 0 : 1);
    if (f.sort === 'waiting') list.sort((a, b) => (b.lastFromCustomer - a.lastFromCustomer) || (a.lastCustomerAt - b.lastCustomerAt));
    else list.sort((a, b) => pri(a) - pri(b) || b.lastAt - a.lastAt);
    return list;
  }

  function assignees() {
    const set = new Set([...(S.me.members || []), S.me.user.name, ...S.tickets.map((t) => t.assignee).filter(Boolean)]);
    return [...set];
  }

  function renderInbox() {
    $('#view').innerHTML = `
      <div class="inbox ${S.selected ? 'show-detail' : ''}" id="inbox">
        <section class="list-pane">
          <div class="kpis" id="kpis"></div>
          <div class="filters">
            <div class="search">${icon.search}<input class="input" id="q" placeholder="고객·제목·주문번호 검색" value="${esc(S.filter.q)}"></div>
            <div class="status-tabs" id="status-tabs"></div>
            <div class="row">
              <select class="select" id="f-type"><option value="">모든 유형</option>${TYPES.map((t) => `<option ${S.filter.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
              <select class="select" id="f-assignee"></select>
              <select class="select" id="f-sort" title="정렬">
                <option value="recent" ${S.filter.sort === 'recent' ? 'selected' : ''}>최신순</option>
                <option value="waiting" ${S.filter.sort === 'waiting' ? 'selected' : ''}>오래 기다린 순</option>
              </select>
            </div>
          </div>
          <div class="list" id="list"></div>
        </section>
        <section class="detail-pane" id="detail"></section>
      </div>`;
    $('#q').addEventListener('input', (e) => { S.filter.q = e.target.value; renderList(); });
    $('#f-type').addEventListener('change', (e) => { S.filter.type = e.target.value; renderList(); });
    $('#f-assignee').addEventListener('change', (e) => { S.filter.assignee = e.target.value; renderList(); });
    $('#f-sort').addEventListener('change', (e) => { S.filter.sort = e.target.value; renderList(); });
    renderList();
    renderDetail();
  }

  function renderList() {
    if (!$('#list')) return;
    const c = counts();
    $('#kpis').innerHTML = [
      ['needReply', '답장 필요', c.needReply, c.needReply ? 'danger' : ''],
      ['urgent', '긴급', c.urgent, c.urgent ? 'danger' : ''],
      ['mine', '내 담당', c.mine, ''],
      ['today', '오늘 접수', c.today, ''],
    ].map(([k, l, n, cls]) => `<button class="kpi ${S.filter.quick === k ? 'active' : ''}" data-action="quick" data-quick="${k}" ${k === 'today' ? 'disabled style="cursor:default"' : ''}><div class="num ${cls}">${n}</div><div class="lbl">${l}</div></button>`).join('');
    $('#status-tabs').innerHTML = [['open', '처리 필요', c.open], ...STATUSES.map((s) => [s, s, c[s]]), ['all', '전체', c.all]]
      .map(([k, l, n]) => `<button class="status-tab ${S.filter.status === k ? 'active' : ''}" data-action="status-filter" data-status="${esc(k)}">${esc(l)}<span class="n">${n}</span></button>`).join('');
    $('#f-assignee').innerHTML = `<option value="">모든 담당자</option><option value="__none" ${S.filter.assignee === '__none' ? 'selected' : ''}>미배정</option>${assignees().map((a) => `<option value="${esc(a)}" ${S.filter.assignee === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}`;
    const list = filtered();
    if (!S.tickets.length) {
      $('#list').innerHTML = `<div class="empty">${S.syncing ? '<span class="spin"></span> Gmail에서 메일을 가져오는 중…' : S.me.google.connected || S.me.demo ? '아직 가져온 메일이 없습니다. 동기화를 눌러 주세요.' : 'Gmail을 연결하면 문의가 여기에 표시됩니다.'}</div>`;
      return;
    }
    if (!list.length) {
      $('#list').innerHTML = '<div class="empty">조건에 맞는 문의가 없습니다.</div>';
      return;
    }
    $('#list').innerHTML = list.map((t) => `
      <article class="item ${t.id === S.selected ? 'selected' : ''} ${t.unread ? 'unread' : ''}" data-action="open" data-id="${esc(t.id)}">
        <div class="top">
          <span class="dot ${esc(t.priority || '')}" title="우선순위 ${esc(t.priority || '-')}"></span>
          <span class="who">${esc(t.customer?.name || t.customer?.email)}</span>
          ${t.messageCount > 1 ? `<span class="hint">${t.messageCount}</span>` : ''}
          <span class="time" title="${esc(fullDate(t.lastAt))}">${ago(t.lastAt)}</span>
        </div>
        <div class="subj">${esc(t.subject)}</div>
        <div class="sum">${esc(t.summary || t.snippet)}</div>
        <div class="tags">
          <span class="chip ${STATUS_CHIP[t.status]}">${esc(t.status)}</span>
          ${t.type ? `<span class="chip ${TYPE_CHIP[t.type] || ''}">${esc(t.type)}</span>` : ''}
          ${OPEN.has(t.status) && t.lastFromCustomer && t.type !== '스팸/광고' ? `<span class="chip danger">답장 필요 · ${ago(t.lastCustomerAt)}</span>` : ''}
          ${t.assignee ? `<span class="avatar sm" title="담당 ${esc(t.assignee)}">${initial(t.assignee)}</span>` : ''}
        </div>
      </article>`).join('');
  }

  async function openTicket(id) {
    if (S.selected !== id) {
      S.composer = { text: '', ko: '', notes: '', instruction: '', loading: false, sending: false };
      S.expanded = new Set();
    }
    S.selected = id;
    S.detail = null;
    S.orders = null;
    $('#inbox')?.classList.add('show-detail');
    renderList();
    renderDetail();
    const [detail, orders] = await Promise.allSettled([
      api(`/api/thread?id=${encodeURIComponent(id)}`),
      api(`/api/shopify?id=${encodeURIComponent(id)}`),
    ]);
    if (S.selected !== id) return;
    if (detail.status === 'fulfilled') {
      S.detail = detail.value;
      if (detail.value.ticket) mergeTicket(detail.value.ticket);
      const t = S.tickets.find((x) => x.id === id);
      if (t) t.unread = false;
    } else {
      S.detail = { error: detail.reason.message };
    }
    S.orders = orders.status === 'fulfilled' ? orders.value : { error: orders.reason.message };
    renderList();
    renderDetail();
  }

  function mergeTicket(ticket) {
    const i = S.tickets.findIndex((t) => t.id === ticket.id);
    if (i >= 0) S.tickets[i] = ticket;
    else S.tickets.push(ticket);
  }

  function renderDetail() {
    const el = $('#detail');
    if (!el) return;
    const t = S.tickets.find((x) => x.id === S.selected);
    if (!t) {
      el.innerHTML = `<div class="detail-empty">${icon.mail}<div>왼쪽에서 문의를 선택하세요</div></div>`;
      return;
    }
    const people = assignees();
    el.innerHTML = `
      <div class="detail-head">
        <div style="display:flex;gap:8px;align-items:flex-start">
          <button class="btn sm ghost back-btn" data-action="close">${icon.back}</button>
          <h2>${esc(t.subject)}</h2>
        </div>
        <div class="meta">
          <span><b>${esc(t.customer?.name)}</b> &lt;${esc(t.customer?.email)}&gt;</span>
          <span class="hint">· 첫 문의 ${esc(fullDate(t.firstAt))}</span>
          ${t.firstReplyAt ? `<span class="hint">· 첫 응답 ${hours((t.firstReplyAt - t.firstAt) / 3600000)} 만에</span>` : ''}
        </div>
        <div class="controls">
          <div class="seg" role="group" aria-label="처리 상태">
            ${STATUSES.map((s) => `<button class="${t.status === s ? 'on' : ''}" data-action="set" data-field="status" data-value="${s}">${s}</button>`).join('')}
          </div>
          <select class="select" data-field-select="assignee" title="담당자">
            <option value="">담당자 없음</option>
            ${people.map((p) => `<option value="${esc(p)}" ${t.assignee === p ? 'selected' : ''}>${esc(p)}${p === S.me.user.name ? ' (나)' : ''}</option>`).join('')}
          </select>
          <select class="select" data-field-select="type" title="유형">
            ${TYPES.map((x) => `<option ${t.type === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          </select>
          <select class="select" data-field-select="priority" title="우선순위">
            ${PRIORITIES.map((x) => `<option ${t.priority === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}
          </select>
          ${t.assignee !== S.me.user.name ? '<button class="btn sm" data-action="take">내가 맡기</button>' : ''}
        </div>
      </div>
      <div class="detail-body">
        <div class="conversation">
          ${t.summary ? `<div class="card ai-summary">${icon.spark}<div><b>AI 요약</b> · ${esc(t.summary)}</div></div>` : ''}
          ${renderMessages()}
          ${renderComposer(t)}
        </div>
        <aside class="side">
          ${renderOrders()}
          <div class="card">
            <div class="card-h">내부 메모</div>
            <div class="card-b"><textarea class="textarea" id="note" placeholder="팀원에게 남길 메모 (고객에게는 보이지 않음)" style="min-height:70px">${esc(t.note || '')}</textarea></div>
          </div>
          <div class="card">
            <div class="card-h">처리 이력</div>
            <div class="card-b history">
              ${(t.history || []).slice().reverse().slice(0, 12).map((h) => `<div class="h"><span class="avatar sm">${initial(h.by)}</span><div><span class="by">${esc(h.by)}</span> <span class="t">${ago(h.at)}</span></div><div class="x">${esc(h.text)}</div></div>`).join('') || '<span class="hint">아직 이력이 없습니다</span>'}
            </div>
          </div>
        </aside>
      </div>`;
    const note = $('#note');
    note.addEventListener('change', () => updateTicket({ note: note.value }, '메모 저장됨'));
    el.querySelectorAll('[data-field-select]').forEach((sel) => sel.addEventListener('change', () => {
      updateTicket({ [sel.dataset.fieldSelect]: sel.value || null });
    }));
    const box = $('#reply-box');
    if (box) box.addEventListener('input', () => { S.composer.text = box.value; });
    const ins = $('#ai-instruction');
    if (ins) {
      ins.addEventListener('input', () => { S.composer.instruction = ins.value; });
      ins.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generateDraft(); } });
    }
  }

  function renderMessages() {
    if (!S.detail) return '<div class="skeleton"><span class="spin"></span> 메일 불러오는 중…</div>';
    if (S.detail.error) return `<div class="card card-b" style="color:var(--danger)">${esc(S.detail.error)}</div>`;
    const ours = S.detail.ourEmails || [];
    const msgs = S.detail.thread.messages;
    return msgs.map((m, i) => {
      const mine = ours.includes(m.from.email);
      const open = i === msgs.length - 1 || i === msgs.length - 2 || S.expanded.has(m.id);
      return `
        <div class="msg ${mine ? 'ours' : ''} ${open ? '' : 'collapsed'}">
          <div class="msg-h" data-action="toggle-msg" data-id="${esc(m.id)}">
            <span class="avatar">${initial(m.from.name)}</span>
            <span class="from">${esc(mine ? `${m.from.name} (우리)` : m.from.name)}</span>
            <span class="addr">${esc(m.from.email)}</span>
            <span class="preview">${esc(m.snippet)}</span>
            <span class="when">${esc(fullDate(m.at))}</span>
          </div>
          <div class="msg-b">${linkify(m.text || m.snippet)}${m.quoted ? `<details class="quoted"><summary>이전 메일 인용 보기</summary>${linkify(m.quoted)}</details>` : ''}${m.attachments?.length ? `<div class="attach">${m.attachments.map((a) => `<span class="chip">${icon.clip}${esc(a.name)}</span>`).join('')}</div>` : ''}</div>
        </div>`;
    }).join('');
  }

  function renderComposer(t) {
    const c = S.composer;
    if (!S.detail || S.detail.error) return '';
    return `
      <div class="card">
        <div class="card-h">답장 <span class="hint">· ${esc(t.customer?.email)}에게</span></div>
        <div class="card-b composer">
          <div class="ai-row">
            <input class="input" id="ai-instruction" placeholder="AI에게 요청 (선택) 예: 교환 가능하다고 안내, 송장번호 포함" value="${esc(c.instruction)}">
            <button class="btn" data-action="draft" ${c.loading ? 'disabled' : ''}>${c.loading ? '<span class="spin"></span> 작성 중' : `${icon.spark} AI 초안`}</button>
          </div>
          ${c.notes ? `<div class="notes"><b>확인할 것</b>\n${esc(c.notes)}</div>` : ''}
          <textarea class="textarea reply-box" id="reply-box" placeholder="답장을 입력하거나 AI 초안을 생성하세요">${esc(c.text)}</textarea>
          ${c.ko ? `<details class="translation" open><summary><b>한국어 번역</b> (참고용, 발송되지 않음)</summary>\n${esc(c.ko)}</details>` : ''}
          <div class="actions">
            <span class="hint">발송 주소: ${esc(S.me.google.email || '-')}</span>
            <span class="spacer"></span>
            <button class="btn" data-action="send" data-mode="draft" ${c.sending ? 'disabled' : ''}>Gmail 임시보관함에 저장</button>
            <button class="btn primary" data-action="send" data-mode="send" ${c.sending ? 'disabled' : ''}>${c.sending ? '<span class="spin"></span>' : ''} 보내기</button>
          </div>
        </div>
      </div>`;
  }

  function renderOrders() {
    const o = S.orders;
    let body;
    if (!o) body = '<div class="hint"><span class="spin"></span> 주문 조회 중…</div>';
    else if (o.error) body = `<div class="hint" style="color:var(--danger)">${esc(o.error)}</div>`;
    else if (!o.configured) body = '<div class="hint">Shopify 연결 전입니다. 설정 탭에서 방법을 확인하세요.</div>';
    else if (!o.orders.length) body = '<div class="hint">이 이메일로 된 주문이 없습니다.</div>';
    else {
      const cu = o.customer;
      body = `
        ${cu ? `<dl class="kv" style="margin:0 0 12px"><dt>고객</dt><dd>${cu.url && cu.url !== '#' ? `<a href="${esc(cu.url)}" target="_blank" rel="noopener">${esc(cu.name)}</a>` : esc(cu.name)}</dd><dt>누적 주문</dt><dd>${esc(cu.orders)}건 · ${esc(cu.spent)}</dd></dl>` : ''}
        ${o.orders.map((x) => `
          <div class="order">
            <div class="row1">
              <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a>
              <span class="hint">${esc(x.createdAt.slice(0, 10))}</span>
              <span class="amt">${esc(x.total)}</span>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${x.cancelled ? '<span class="chip danger">취소됨</span>' : ''}
              <span class="chip ${x.financial === 'paid' ? 'ok' : 'warn'}">${esc(x.financial)}</span>
              <span class="chip ${x.fulfillment === 'fulfilled' ? 'ok' : 'info'}">${esc(x.fulfillment)}</span>
              ${x.refunded ? `<span class="chip warn">환불 ${esc(x.refunded)}</span>` : ''}
            </div>
            <div class="items">${x.items.map((i) => `${esc(i.title)} ×${esc(i.quantity)}`).join('<br>')}</div>
            ${x.tracking.map((tr) => `<div>${esc(tr.company || '')} ${tr.url ? `<a href="${esc(tr.url)}" target="_blank" rel="noopener">${esc(tr.number)}</a>` : esc(tr.number || '')} <span class="hint">${esc(tr.status || '')}</span></div>`).join('')}
          </div>`).join('')}`;
    }
    return `<div class="card"><div class="card-h">Shopify 주문</div><div class="card-b">${body}</div></div>`;
  }

  async function updateTicket(patch, okMsg) {
    const id = S.selected;
    const t = S.tickets.find((x) => x.id === id);
    const before = { ...t };
    Object.assign(t, patch);
    renderList();
    renderDetail();
    try {
      const { ticket } = await api('/api/thread', { method: 'POST', body: { id, ...patch } });
      mergeTicket(ticket);
      if (okMsg) toast(okMsg);
    } catch (err) {
      Object.assign(t, before);
      toast(err.message, 'error');
    }
    renderList();
    if (S.selected === id) renderDetail();
  }

  async function generateDraft() {
    const id = S.selected;
    S.composer.loading = true;
    renderDetail();
    try {
      const d = await api('/api/ai', { method: 'POST', body: { action: 'draft', id, instruction: S.composer.instruction } });
      if (S.selected !== id) return;
      Object.assign(S.composer, { text: d.reply, ko: d.ko, notes: d.notes });
    } catch (err) {
      toast(err.message, 'error');
    }
    S.composer.loading = false;
    if (S.selected === id) renderDetail();
  }

  async function sendReply(mode) {
    const text = ($('#reply-box')?.value || '').trim();
    if (!text) return toast('답장 내용을 입력해 주세요', 'error');
    const t = S.tickets.find((x) => x.id === S.selected);
    if (mode === 'send' && !confirm(`${t.customer?.email} 에게 이 답장을 바로 보낼까요?`)) return;
    S.composer.sending = true;
    S.composer.text = text;
    renderDetail();
    try {
      const r = await api('/api/send', { method: 'POST', body: { id: t.id, text, mode } });
      if (r.ticket) mergeTicket(r.ticket);
      toast(mode === 'send' ? '답장을 보냈습니다' : 'Gmail 임시보관함에 저장했습니다');
      if (mode === 'send') {
        S.composer = { text: '', ko: '', notes: '', instruction: '', loading: false, sending: false };
        return openTicket(t.id);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
    S.composer.sending = false;
    renderList();
    renderDetail();
  }

  // ---------- 동기화 ----------
  async function loadTickets() {
    const d = await api('/api/threads');
    S.tickets = d.tickets;
    S.syncedAt = d.syncedAt;
    S.syncedBy = d.syncedBy;
  }

  async function sync({ quiet = false } = {}) {
    if (S.syncing) return;
    if (!S.me.google.connected && !S.me.demo) {
      if (!quiet) toast('먼저 Gmail을 연결해 주세요', 'error');
      return;
    }
    S.syncing = true;
    renderSyncInfo();
    if (S.view === 'inbox') renderList();
    try {
      const d = await api('/api/threads', { method: 'POST', body: { action: 'sync' } });
      S.tickets = d.tickets;
      S.syncedAt = d.syncedAt;
      if (!quiet) toast(d.classified ? `동기화 완료 · 새 문의 ${d.classified}건 분류` : '동기화 완료');
    } catch (err) {
      if (err.code === 'GOOGLE_RECONNECT') { S.me.google.connected = false; renderShell(); }
      toast(err.message, 'error');
    }
    S.syncing = false;
    renderSyncInfo();
    if (S.view === 'inbox') { renderList(); if (S.selected) renderDetail(); }
    if (S.view === 'stats') loadStats();
  }

  // ---------- 통계 ----------
  async function loadStats() {
    try {
      S.stats = await api(`/api/stats?days=${S.days}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    if (S.view === 'stats') drawStats();
  }

  function renderStats() {
    $('#view').innerHTML = `
      <div class="page"><div class="page-inner">
        <div class="page-head">
          <h2>CS 통계</h2>
          <div class="right seg" role="group" aria-label="기간">
            ${[7, 30, 90].map((d) => `<button class="${S.days === d ? 'on' : ''}" data-action="days" data-days="${d}">${d}일</button>`).join('')}
          </div>
        </div>
        <div id="stats-body"><div class="skeleton"><span class="spin"></span> 계산 중…</div></div>
      </div></div>`;
    if (S.stats && S.stats.days === S.days) drawStats();
    loadStats();
  }

  function drawStats() {
    const s = S.stats;
    const el = $('#stats-body');
    if (!el || !s) return;
    const typeEntries = Object.entries(s.byType).sort((a, b) => b[1] - a[1]);
    const maxType = Math.max(1, ...typeEntries.map((e) => e[1]));
    el.innerHTML = `
      <div style="display:grid;gap:16px">
        <div class="tiles">
          <div class="tile"><div class="lbl">접수 (광고 제외)</div><div class="val">${s.received}<small>건</small></div><div class="sub">최근 ${s.days}일</div></div>
          <div class="tile"><div class="lbl">미처리 잔량</div><div class="val">${s.backlog}<small>건</small></div><div class="sub">24시간 넘게 대기 ${s.overdue}건</div></div>
          <div class="tile"><div class="lbl">첫 응답 시간 (중앙값)</div><div class="val">${hours(s.medianResponseHours)}</div><div class="sub">평균 ${hours(s.avgResponseHours)}</div></div>
          <div class="tile"><div class="lbl">24시간 내 응답률</div><div class="val">${s.within24Rate == null ? '–' : Math.round(s.within24Rate * 100)}<small>${s.within24Rate == null ? '' : '%'}</small></div><div class="sub">응답 ${s.replied}건 / 접수 ${s.received}건</div></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-h">일별 접수 건수 <span class="right hint">KST 기준</span></div>
            <div class="chart-wrap">${barChart(s.daily)}</div>
          </div>
          <div class="card">
            <div class="card-h">유형별</div>
            <div class="hbars">
              ${typeEntries.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div class="track"><div class="fill" style="width:${(v / maxType) * 100}%"></div></div><span class="n">${v}</span></div>`).join('') || '<span class="hint">데이터 없음</span>'}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-h">담당자별</div>
          <table class="tbl">
            <thead><tr><th>담당자</th><th class="num">배정</th><th class="num">처리 중</th><th class="num">완료</th></tr></thead>
            <tbody>
              ${Object.entries(s.byAssignee).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.total}</td><td class="num">${v.open}</td><td class="num">${v.done}</td></tr>`).join('') || '<tr><td colspan="4" class="hint">데이터 없음</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
    el.querySelectorAll('.bar-hit').forEach((r) => {
      r.addEventListener('mouseenter', (e) => showTip(e, r.dataset.tip, r));
      r.addEventListener('mousemove', (e) => moveTip(e));
      r.addEventListener('mouseleave', () => hideTip(r));
    });
  }

  function barChart(daily) {
    const W = 640, H = 220, L = 30, R = 8, T = 10, B = 26;
    const max = Math.max(4, ...daily.map((d) => d.received));
    const step = Math.ceil(max / 4);
    const top = step * 4;
    const n = daily.length;
    const slot = (W - L - R) / n;
    const bw = Math.max(2, Math.min(22, slot - 2));
    const y = (v) => T + (H - T - B) * (1 - v / top);
    const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
    const labelEvery = n <= 10 ? 1 : n <= 31 ? 5 : 15;
    const bars = daily.map((d, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const h = (H - T - B) * (d.received / top);
      const r = Math.min(4, bw / 2, h);
      const path = d.received
        ? `M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + bw - r} Q${x + bw},${y(0) - h} ${x + bw},${y(0) - h + r} V${y(0)} Z`
        : '';
      const label = `${d.date.slice(5).replace('-', '/')} · 접수 ${d.received}건 · 첫 응답 ${d.replied}건`;
      return `${path ? `<path class="bar" data-i="${i}" d="${path}"/>` : ''}<rect class="bar-hit" data-i="${i}" data-tip="${esc(label)}" x="${L + i * slot}" y="${T}" width="${slot}" height="${H - T - B}" fill="transparent"/>
        ${i % labelEvery === 0 || i === n - 1 ? `<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${d.date.slice(5).replace('-', '/')}</text>` : ''}`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="일별 접수 건수 막대 차트">
      <g class="grid">${ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
      <g class="axis">${ticks.map((v) => `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}${bars}</g>
    </svg>`;
  }

  function showTip(e, text, r) {
    const tip = $('#tooltip');
    tip.textContent = text;
    tip.hidden = false;
    r.parentNode.querySelector(`.bar[data-i="${r.dataset.i}"]`)?.classList.add('hover');
    moveTip(e);
  }
  function moveTip(e) {
    const tip = $('#tooltip');
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = `${x}px`;
    tip.style.top = `${e.clientY - tip.offsetHeight - 10}px`;
  }
  function hideTip(r) {
    $('#tooltip').hidden = true;
    r.parentNode.querySelector(`.bar[data-i="${r.dataset.i}"]`)?.classList.remove('hover');
  }

  // ---------- 설정 ----------
  async function renderSettings() {
    $('#view').innerHTML = '<div class="page"><div class="page-inner"><div class="skeleton"><span class="spin"></span></div></div></div>';
    try {
      S.settings = await api('/api/settings');
    } catch (err) {
      toast(err.message, 'error');
      return;
    }
    const g = S.me.google;
    const st = S.settings;
    $('#view').innerHTML = `
      <div class="page"><div class="page-inner">
        <div class="page-head"><h2>설정</h2></div>
        <div class="settings">
          <div style="display:grid;gap:16px">
            <div class="card">
              <div class="card-h">연결</div>
              <div class="conn">
                <div><div class="name">Gmail</div><div class="desc">${g.connected ? `${esc(g.email)} · ${esc(g.connectedBy || '')} 님이 ${ago(g.connectedAt)} 연결` : g.broken ? '연결 만료 — 다시 연결해 주세요' : '연결 안 됨'}</div></div>
                <div class="right">
                  ${g.connected ? '<span class="chip ok">연결됨</span>' : '<span class="chip danger">필요</span>'}
                  ${S.me.demo ? '' : `<a class="btn sm" href="/api/google?action=start">${g.connected ? '다시 연결' : '연결'}</a>`}
                  ${g.connected && !S.me.demo ? '<button class="btn sm ghost danger" data-action="disconnect">해제</button>' : ''}
                </div>
              </div>
              <div class="conn">
                <div><div class="name">Shopify</div><div class="desc">${S.me.shopify.configured ? '주문 조회 사용 가능' : 'Vercel 환경변수 SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_TOKEN 필요'}</div></div>
                <div class="right">${S.me.shopify.configured ? '<span class="chip ok">연결됨</span>' : '<span class="chip">미설정</span>'}</div>
              </div>
              <div class="conn">
                <div><div class="name">Claude AI</div><div class="desc">${S.me.ai.enabled ? `자동 분류 · 답장 초안 (${esc(S.me.ai.model)})` : 'ANTHROPIC_API_KEY 없음 — 키워드 분류와 기본 템플릿으로 동작'}</div></div>
                <div class="right">${S.me.ai.enabled ? '<span class="chip ok">사용 중</span>' : '<span class="chip">미설정</span>'}</div>
              </div>
            </div>
            <div class="card">
              <div class="card-h">메일 가져오기</div>
              <div class="form">
                <label class="field">Gmail 검색식
                  <input class="input" id="s-query" value="${esc(st.query)}">
                  <span class="hint">Gmail 검색창 문법 그대로. 최근 80개 스레드를 가져옵니다.</span>
                </label>
                <label class="field">우리 쪽 발신 주소 (별칭)
                  <input class="input" id="s-aliases" value="${esc((st.aliases || []).join(', '))}" placeholder="support@drrejuall.com, hello@...">
                  <span class="hint">이 주소에서 보낸 메일은 '우리 답장'으로 인식합니다. 연결된 계정은 자동 포함.</span>
                </label>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-h">AI 답장 가이드</div>
            <div class="form">
              <label class="field">CS 정책 · 톤 가이드
                <textarea class="textarea" id="s-guide" style="min-height:260px">${esc(st.guide)}</textarea>
                <span class="hint">환불 기준, 배송 기간, 자주 묻는 답변 등을 적어두면 AI 초안이 그대로 따릅니다.</span>
              </label>
              <label class="field">서명
                <textarea class="textarea" id="s-signature" style="min-height:70px">${esc(st.signature)}</textarea>
              </label>
              <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-action="save-settings">저장</button></div>
            </div>
          </div>
        </div>
      </div></div>`;
  }

  async function saveSettings() {
    try {
      S.settings = await api('/api/settings', {
        method: 'POST',
        body: {
          query: $('#s-query').value,
          aliases: $('#s-aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
          guide: $('#s-guide').value,
          signature: $('#s-signature').value,
        },
      });
      toast('설정을 저장했습니다');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- 이벤트 ----------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    if (a === 'view') {
      S.view = el.dataset.view;
      renderView();
    } else if (a === 'sync') sync();
    else if (a === 'logout') {
      await api('/api/auth', { method: 'POST', body: { action: 'logout' } }).catch(() => {});
      S.me = null;
      renderLogin();
    } else if (a === 'open') openTicket(el.dataset.id);
    else if (a === 'close') {
      S.selected = null;
      renderInbox();
    } else if (a === 'status-filter') {
      S.filter.status = el.dataset.status;
      S.filter.quick = '';
      renderList();
    } else if (a === 'quick') {
      S.filter.quick = S.filter.quick === el.dataset.quick ? '' : el.dataset.quick;
      if (S.filter.quick) S.filter.status = 'open';
      renderList();
    } else if (a === 'set') updateTicket({ [el.dataset.field]: el.dataset.value });
    else if (a === 'take') updateTicket({ assignee: S.me.user.name, ...(S.tickets.find((t) => t.id === S.selected)?.status === '미처리' ? { status: '진행중' } : {}) });
    else if (a === 'toggle-msg') {
      const msg = el.closest('.msg');
      msg.classList.toggle('collapsed');
      if (msg.classList.contains('collapsed')) S.expanded.delete(el.dataset.id);
      else S.expanded.add(el.dataset.id);
    } else if (a === 'draft') generateDraft();
    else if (a === 'send') sendReply(el.dataset.mode);
    else if (a === 'days') {
      S.days = Number(el.dataset.days);
      renderStats();
    } else if (a === 'save-settings') saveSettings();
    else if (a === 'disconnect') {
      if (!confirm('Gmail 연결을 해제할까요? 팀 전체가 메일을 볼 수 없게 됩니다.')) return;
      await api('/api/google', { method: 'POST', body: { action: 'disconnect' } }).catch((err) => toast(err.message, 'error'));
      await refreshMe();
      renderShell();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.view === 'inbox' && S.selected && !e.target.closest('input, textarea, select')) {
      S.selected = null;
      renderInbox();
    }
  });

  setInterval(() => renderSyncInfo(), 60_000);

  // ---------- 시작 ----------
  async function refreshMe() {
    S.me = await api('/api/auth');
    S.members = S.me.members;
  }

  async function boot() {
    try {
      await refreshMe();
    } catch (err) {
      app().innerHTML = `<div class="boot">${esc(err.message)}</div>`;
      return;
    }
    if (!S.me.user) return renderLogin(S.me.members);
    const params = new URLSearchParams(location.search);
    if (params.get('google')) {
      if (params.get('google') === 'connected') toast(`Gmail 연결 완료: ${params.get('email') || ''}`);
      else {
        const msg = params.get('msg') || params.get('google');
        const hint = /has not been used|disabled/.test(msg) ? ' → Google Cloud Console에서 Gmail API를 "사용"으로 켠 뒤 몇 분 후 다시 연결하세요.' : '';
        toast(`Gmail 연결 실패: ${msg}${hint}`, 'error');
      }
      history.replaceState(null, '', location.pathname);
    }
    renderShell();
    try {
      await loadTickets();
      if (S.view === 'inbox') renderList();
    } catch (err) {
      toast(err.message, 'error');
    }
    // 마지막 동기화가 3분 넘었으면 자동으로 새 메일 가져오기
    if (Date.now() - S.syncedAt > 3 * 60_000) sync({ quiet: true });
  }

  boot();
})();
