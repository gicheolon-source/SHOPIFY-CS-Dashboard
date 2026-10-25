/* Reju-All CS Desk — 프론트엔드 (빌드 없음, 바닐라 JS) */
(() => {
  'use strict';

  const STATUSES = ['미처리', '진행중', '고객 대기', '답변완료', '종결'];
  const TYPES = ['배송', '교환/환불', '제품 문의', '주문/결제', '피부 트러블', '정품 인증', '제휴/인플루언서', 'B2B/도매', '스팸/광고', '기타'];
  const PRIORITIES = ['긴급', '보통', '낮음'];
  const OPEN = new Set(['미처리', '진행중']);
  const STATUS_CHIP = { 미처리: 'danger', 진행중: 'warn', '고객 대기': 'info', 답변완료: 'ok', 종결: '' };
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
    bulk: new Set(), // 목록에서 체크한 티켓 (일괄 처리)
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
          <label class="field">아이디
            <input class="input" name="id" autocomplete="username" required>
          </label>
          <label class="field">비밀번호
            <input class="input" name="password" type="password" autocomplete="current-password" required>
          </label>
          <label class="field">내 이름 <span class="hint">담당자·보낸 사람 표시용</span>
            ${members.length
              ? `<select class="select" name="name" style="width:100%">${members.map((m) => `<option>${esc(m)}</option>`).join('')}</select>`
              : '<input class="input" name="name" autocomplete="nickname" placeholder="예: Josh" required>'}
          </label>
          <div class="error-text" id="login-error"></div>
          <button class="btn primary" type="submit" style="justify-content:center;height:40px">로그인</button>
        </form>
      </div>`;
    try {
      const last = localStorage.getItem('cs_last_name');
      if (last) $('[name=name]').value = last;
      const lastId = localStorage.getItem('cs_last_id');
      if (lastId) $('[name=id]').value = lastId;
    } catch {}
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        await api('/api/auth', { method: 'POST', body: { action: 'login', id: f.get('id'), name: f.get('name'), password: f.get('password') } });
        try {
          localStorage.setItem('cs_last_name', f.get('name'));
          localStorage.setItem('cs_last_id', f.get('id'));
        } catch {}
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
            ${[['inbox', '인박스'], ['sent', '보낸 메일'], ['stats', '통계'], ['settings', '설정']].map(([k, l]) => `<button class="tab ${S.view === k ? 'active' : ''}" data-action="view" data-view="${k}">${l}</button>`).join('')}
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
    else if (S.view === 'sent') renderSent();
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
          <div class="bulk-bar" id="bulk-bar" hidden></div>
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
      <article class="item ${t.id === S.selected ? 'selected' : ''} ${t.unread || t.groupUnread ? 'unread' : ''} ${S.bulk.has(t.id) ? 'picked' : ''}" data-action="open" data-id="${esc(t.id)}">
        <div class="top">
          <input type="checkbox" class="pick" data-action="pick" data-id="${esc(t.id)}" title="여러 건 선택" ${S.bulk.has(t.id) ? 'checked' : ''}>
          <span class="dot ${esc(t.priority || '')}" title="우선순위 ${esc(t.priority || '-')}"></span>
          <span class="who">${esc(t.customer?.name || t.customer?.email)}</span>
          ${(t.groupMessages || t.messageCount) > 1 ? `<span class="hint" title="${t.related?.length ? `따로 온 메일 ${t.related.length + 1}건을 하나로 묶음` : ''}">${t.groupMessages || t.messageCount}</span>` : ''}
          <span class="time" title="${esc(fullDate(t.lastAt))}">${ago(t.lastAt)}</span>
        </div>
        <div class="subj">${esc(t.subject)}</div>
        <div class="sum">${esc(t.summary || t.snippet)}</div>
        <div class="tags">
          <span class="chip ${STATUS_CHIP[t.status]}">${esc(t.status)}</span>
          ${t.type ? `<span class="chip ${TYPE_CHIP[t.type] || ''}">${esc(t.type)}</span>` : ''}
          ${OPEN.has(t.status) && t.lastFromCustomer && t.type !== '스팸/광고' ? `<span class="chip danger">답장 필요 · ${ago(t.lastCustomerAt)}</span>` : ''}
          ${t.followup && OPEN.has(t.status) ? '<span class="chip warn" title="고객 대기 중 회신이 없어 다시 열림">팔로업 필요</span>' : ''}
          ${OPEN.has(t.status) && t.lastFromCustomer && draftFresh(t) ? '<span class="chip ok" title="열면 미리 만든 AI 초안이 답장 칸에 들어가 있어요">AI 초안 준비</span>' : ''}
          ${t.amazonOrder ? `<span class="chip accent" title="아마존 주문번호 ${esc(t.amazonOrder)}">아마존 주문</span>` : ''}
          ${t.form ? '<span class="chip" title="홈페이지 문의 폼으로 들어온 문의">문의 폼</span>' : ''}
          ${t.assignee ? `<span class="avatar sm" title="담당 ${esc(t.assignee)}">${initial(t.assignee)}</span>` : ''}
        </div>
      </article>`).join('');
    renderBulkBar();
  }

  // ---------- 일괄 처리 ----------
  function renderBulkBar() {
    const bar = $('#bulk-bar');
    if (!bar) return;
    // 목록에서 사라진(동기화·필터) 티켓은 선택에서 뺀다
    for (const id of S.bulk) if (!S.tickets.some((t) => t.id === id)) S.bulk.delete(id);
    bar.hidden = !S.bulk.size;
    if (!S.bulk.size) return;
    bar.innerHTML = `
      <b>${S.bulk.size}건 선택</b>
      <select class="select" id="bulk-status"><option value="">상태 바꾸기…</option>${STATUSES.map((s) => `<option>${s}</option>`).join('')}</select>
      <select class="select" id="bulk-assignee"><option value="">담당자 바꾸기…</option><option value="__none">담당자 없음</option>${assignees().map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('')}</select>
      <button class="btn sm ghost" data-action="bulk-all">목록 전체 선택</button>
      <button class="btn sm ghost" data-action="bulk-clear">선택 해제</button>`;
    $('#bulk-status').addEventListener('change', (e) => e.target.value && bulkApply({ status: e.target.value }));
    $('#bulk-assignee').addEventListener('change', (e) => e.target.value && bulkApply({ assignee: e.target.value === '__none' ? null : e.target.value }));
  }

  async function bulkApply(patch) {
    const ids = [...S.bulk];
    const what = patch.status ? `상태를 '${patch.status}'(으)로` : `담당자를 '${patch.assignee || '없음'}'(으)로`;
    if (!confirm(`선택한 ${ids.length}건의 ${what} 바꿀까요?`)) return renderBulkBar();
    try {
      const r = await api('/api/threads', { method: 'POST', body: { action: 'bulk', ids, patch } });
      r.tickets.forEach(mergeTicket);
      S.bulk.clear();
      toast(`${r.tickets.length}건을 바꿨습니다`);
    } catch (err) {
      toast(err.message, 'error');
    }
    renderList();
    renderDetail();
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
      if (t) Object.assign(t, { unread: false, groupUnread: false });
    } else {
      S.detail = { error: detail.reason.message };
      if (detail.reason.code === 'THREAD_GONE') S.tickets = S.tickets.filter((x) => x.id !== id);
    }
    S.orders = orders.status === 'fulfilled' ? orders.value : { error: orders.reason.message };
    renderList();
    renderDetail();
    const t = S.tickets.find((x) => x.id === id);
    if (t) applyDraft(t);
  }

  // ---------- AI 초안 미리 만들기 ----------
  // 답장이 필요한 새 문의는 화면이 열려 있는 동안 백그라운드로 초안을 만들어 티켓에 저장한다 (팀 전체 공유)
  const draftFresh = (t) => t.draft && t.draft.for >= t.lastCustomerAt;
  let prefilling = false;
  async function prefillDrafts() {
    if (prefilling || !S.me?.ai?.enabled || S.settings?.autoDraft === false) return;
    prefilling = true;
    try {
      const todo = S.tickets
        .filter((t) => OPEN.has(t.status) && t.lastFromCustomer && t.type && t.type !== '스팸/광고' && !t.autoClosed && !draftFresh(t)
          && !(t.draftPendingAt && Date.now() - t.draftPendingAt < 3 * 60_000))
        .sort((a, b) => b.lastCustomerAt - a.lastCustomerAt)
        .slice(0, 15);
      const worker = async () => {
        for (let t = todo.shift(); t; t = todo.shift()) {
          try {
            const r = await api('/api/ai', { method: 'POST', body: { action: 'prefill', id: t.id } });
            if (!r.ticket) continue;
            mergeTicket(r.ticket);
            if (S.view === 'inbox') renderList();
            applyDraft(r.ticket);
          } catch {}
        }
      };
      await Promise.all([worker(), worker()]);
    } finally {
      prefilling = false;
    }
  }

  // 열려 있는 문의의 답장 칸이 비어 있으면 미리 만든 초안을 넣는다
  function applyDraft(t) {
    if (S.selected !== t.id || !draftFresh(t) || !t.lastFromCustomer || !S.detail || S.detail.error) return;
    if (S.composer.text || S.composer.loading) return;
    Object.assign(S.composer, { text: t.draft.reply, ko: t.draft.ko, notes: t.draft.notes, prefilled: t.draft.at });
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
          ${t.form ? `<span class="chip" title="홈페이지 문의 폼">문의 폼${t.form.country ? ` · ${esc(t.form.country)}` : ''}${t.form.phone ? ` · ${esc(t.form.phone)}` : ''}</span>` : ''}
          ${t.amazonOrder ? `<span class="chip accent" title="아마존에서 산 주문 — 고객 정보·주문 내역을 우리가 볼 수 없음">아마존 주문 ${esc(t.amazonOrder)}</span>` : ''}
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
          ${renderCustomerHistory(t)}
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
    const pick = $('#tpl-pick');
    if (pick) pick.addEventListener('change', () => { if (pick.value) insertTemplate(pick.value); });
    const after = $('#after-status');
    if (after) after.addEventListener('change', () => { S.composer.after = after.value; });
    const ins = $('#ai-instruction');
    if (ins) {
      ins.addEventListener('input', () => { S.composer.instruction = ins.value; });
      ins.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); generateDraft(); } });
    }
  }

  // 같은 고객의 다른 문의 (반복 문의·이전 처리 내역 확인용)
  function renderCustomerHistory(t) {
    const email = t.customer?.email;
    const others = S.tickets.filter((x) => x.id !== t.id && x.customer?.email === email).sort((a, b) => b.lastAt - a.lastAt);
    const sent = (S.sent?.items || []).filter((m) => m.to.some((x) => x.email === email)).length;
    return `
      <div class="card">
        <div class="card-h">이 고객의 다른 문의 <span class="right hint">${others.length}건${sent ? ` · 보낸 메일 ${sent}통` : ''}</span></div>
        <div class="card-b cust-hist">
          ${others.slice(0, 8).map((x) => `
            <button class="ch-row" data-action="open" data-id="${esc(x.id)}">
              <span class="chip ${STATUS_CHIP[x.status]}">${esc(x.status)}</span>
              <span class="ch-subj">${esc(x.subject)}</span>
              <span class="hint">${esc(fullDate(x.firstAt))}</span>
            </button>`).join('') || '<span class="hint">처음 문의한 고객입니다</span>'}
        </div>
      </div>`;
  }

  // 첨부: 사진은 미리보기, 나머지는 내려받기 (Gmail 첨부 ID가 있을 때)
  function renderAttachments(m) {
    if (!m.attachments?.length) return '';
    const url = (a) => `/api/thread?att=${encodeURIComponent(a.attachmentId)}&msg=${encodeURIComponent(m.id)}&mime=${encodeURIComponent(a.mime || '')}&name=${encodeURIComponent(a.name)}`;
    const isImg = (a) => /^image\/(png|jpe?g|gif|webp)$/i.test(a.mime || '');
    return `
      <div class="attach">
        ${m.attachments.map((a) => (!a.attachmentId
          ? `<span class="chip">${icon.clip}${esc(a.name)}</span>`
          : isImg(a)
            ? `<a class="thumb" href="${url(a)}" target="_blank" rel="noopener" title="${esc(a.name)}"><img src="${url(a)}" alt="${esc(a.name)}" loading="lazy"></a>`
            : `<a class="chip" href="${url(a)}" title="내려받기">${icon.clip}${esc(a.name)}</a>`)).join('')}
      </div>`;
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
          <div class="msg-b">${linkify(m.text || m.snippet)}${m.quoted ? `<details class="quoted"><summary>이전 메일 인용 보기</summary>${linkify(m.quoted)}</details>` : ''}${renderAttachments(m)}</div>
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
            <button class="btn" data-action="draft" ${c.loading ? 'disabled' : ''}>${c.loading ? `<span class="spin"></span> ${c.loading === 'fill' ? '빈칸 채우는 중' : '작성 중'}` : `${icon.spark} AI 초안`}</button>
          </div>
          ${templatePicker(t)}
          ${c.prefilled ? `<div class="prefilled">${icon.spark} 새 문의가 들어올 때 미리 만들어 둔 AI 초안이에요 (${ago(c.prefilled)}). 확인하고 고친 뒤 보내세요.</div>` : ''}
          ${c.action || c.forward ? `<div class="todo"><b>처리할 일</b> (고객에게 보내지 않음)\n${esc(c.action || '')}${c.forward ? `<div class="todo-act"><button class="btn sm" data-action="forward" data-to="${esc(c.forward)}">${icon.mail}${esc(c.forward)}로 메일 전달 (첨부 포함)</button></div>` : ''}</div>` : ''}
          ${c.notes ? `<div class="notes"><b>확인할 것</b>\n${esc(c.notes)}</div>` : ''}
          <textarea class="textarea reply-box" id="reply-box" placeholder="답장을 입력하거나 AI 초안을 생성하세요">${esc(c.text)}</textarea>
          ${c.ko ? `<details class="translation" open><summary><b>한국어 번역</b> (참고용, 발송되지 않음)</summary>\n${esc(c.ko)}</details>` : ''}
          <div class="actions">
            <span class="hint">발송 주소: ${esc(S.me.google.email || '-')}</span>
            <button class="btn sm ghost" data-action="forward" title="고객 메일을 다른 팀 주소로 전달 (첨부 포함)">전달</button>
            <span class="spacer"></span>
            <label class="hint after-sel">보낸 뒤
              <select class="select" id="after-status">
                ${['진행중', '고객 대기', '답변완료', '종결'].map((s) => `<option ${(c.after || '답변완료') === s ? 'selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
            <button class="btn" data-action="send" data-mode="draft" ${c.sending ? 'disabled' : ''}>Gmail 임시보관함에 저장</button>
            <button class="btn primary" data-action="send" data-mode="send" ${c.sending ? 'disabled' : ''}>${c.sending ? '<span class="spin"></span>' : ''} 보내기</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- 자주 쓰는 답변 ----------
  function templatePicker(t) {
    const list = S.settings?.templates || [];
    if (!list.length) return '';
    const opt = (x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`;
    const recommended = list.filter((x) => (x.types || []).includes(t.type));
    // 아마존 주문번호가 보이면 아마존 주문용 답변을 맨 위에 (본문 속 번호도 확인)
    const amazon = t.amazonOrder || (S.detail?.thread?.messages || []).some((m) => /\b\d{3}-\d{7}-\d{7}\b/.test(m.text || ''));
    const amazonTpls = amazon ? list.filter((x) => x.id.startsWith('m-amazon')) : [];
    // AI가 분류할 때 메일 내용을 보고 고른 답변 (잘 맞는 순서)
    const suggested = (t.suggested || []).map((id) => list.find((x) => x.id === id)).filter(Boolean);
    const cats = [...new Set(list.map((x) => x.cat))];
    return `
      <div class="tpl-row">
        <select class="select" id="tpl-pick">
          <option value="">자주 쓰는 답변 넣기…</option>
          ${suggested.length ? `<optgroup label="★ 추천 · 이 문의 내용에 맞는 답변">${suggested.map(opt).join('')}</optgroup>` : ''}
          ${amazonTpls.length ? `<optgroup label="추천 · 아마존 주문">${amazonTpls.map(opt).join('')}</optgroup>` : ''}
          ${recommended.length ? `<optgroup label="추천 · ${esc(t.type)}">${recommended.map(opt).join('')}</optgroup>` : ''}
          ${cats.map((cat) => `<optgroup label="${esc(cat)}">${list.filter((x) => x.cat === cat).map(opt).join('')}</optgroup>`).join('')}
        </select>
        <span class="hint">빈칸은 AI가 메일·주문 내용으로 채워요 (확인 안 되는 건 남겨둠)</span>
      </div>
      ${suggested.length ? `<div class="tpl-suggest"><span class="hint">★ 추천 답변</span>${suggested.map((x) => `<button class="btn xs" data-action="tpl-insert" data-id="${esc(x.id)}" title="${esc(x.cat)}">${esc(x.title)}</button>`).join('')}</div>` : ''}`;
  }

  function fillTemplate(body, t) {
    const first = (t.customer?.name || '').trim().split(/\s+/)[0];
    const name = first && !/@/.test(first) ? first : 'there';
    return body
      .replace(/\{name\}/g, name)
      .replace(/\{order\}/g, t.orderRefs?.[0] || '[주문번호]')
      .replace(/\{signature\}/g, S.settings?.signature || '');
  }

  function insertTemplate(id) {
    const t = S.tickets.find((x) => x.id === S.selected);
    const tpl = (S.settings?.templates || []).find((x) => x.id === id);
    if (!t || !tpl) return;
    const text = fillTemplate(tpl.body, t);
    const box = $('#reply-box');
    const current = (box ? box.value : S.composer.text).trim();
    const replace = !current || confirm('작성 중인 답장을 이 템플릿으로 바꿀까요?\n(취소하면 아래에 이어 붙입니다)');
    S.composer.text = replace ? text : `${current}\n\n${text}`;
    Object.assign(S.composer, { ko: '', notes: '', action: tpl.action || '', forward: tpl.forward || '', after: tpl.after || '', prefilled: 0 });
    renderDetail();
    // [국가명]·[트래킹넘버] 같은 한글 빈칸이 있으면 메일·Shopify 주문 내용으로 AI가 자동으로 채운다
    if (replace && S.me.ai.enabled && /\[[^\]\n]*[가-힣][^\]\n]*\]/.test(text)) generateDraft(text);
    else $('#reply-box')?.focus();
  }

  async function loadSettings() {
    try {
      S.settings = await api('/api/settings');
    } catch {}
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
            ${x.id && x.id.startsWith('gid://') ? `
            <div class="order-acts">
              ${!x.cancelled ? `<button class="btn xs" data-action="order-act" data-kind="cancel" data-idx="${idx(x)}">취소</button>` : ''}
              ${!x.cancelled ? `<button class="btn xs" data-action="order-act" data-kind="address" data-idx="${idx(x)}">주소 변경</button>` : ''}
              ${x.refundable ? `<button class="btn xs" data-action="order-act" data-kind="refund" data-idx="${idx(x)}">환불</button>` : ''}
              <button class="btn xs ghost" data-action="order-act" data-kind="note" data-idx="${idx(x)}">메모</button>
            </div>` : ''}
          </div>`).join('')}`;
    }
    return `<div class="card"><div class="card-h">Shopify 주문</div><div class="card-b">${body}</div></div>`;
  }

  const idx = (x) => S.orders.orders.indexOf(x);

  // ---------- Shopify 주문 처리 (취소·주소 변경·환불·메모) ----------
  // 실제 주문을 바꾸므로: 입력 → 요약 확인 → 실행 → 처리 이력·Shopify 메모에 기록
  const CANCEL_REASONS = [['CUSTOMER', '고객 요청'], ['FRAUD', '사기 의심'], ['DECLINED', '결제 거절'], ['INVENTORY', '재고 없음'], ['STAFF', '직원 실수'], ['OTHER', '기타']];

  function openOrderAction(kind, i) {
    const x = S.orders?.orders?.[i];
    if (!x) return;
    const a = x.address || {};
    const field = (name, label, value = '', attrs = '') => `<label class="field">${label}<input class="input" name="${name}" value="${esc(value || '')}" ${attrs}></label>`;
    const forms = {
      cancel: {
        title: `주문 ${x.name} 취소`,
        body: `
          ${x.fulfillment !== 'unfulfilled' ? `<div class="warn-box">이미 출고(${esc(x.fulfillment)})된 주문이에요. Shopify에서 취소가 거부될 수 있어요.</div>` : ''}
          <label class="field">취소 사유<select class="select" name="reason">${CANCEL_REASONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="refund" checked> 원결제 수단으로 전액 환불</label>
          <label class="check"><input type="checkbox" name="restock" checked> 재고 복원</label>
          <label class="check"><input type="checkbox" name="notify"> Shopify 취소 안내 메일을 고객에게 보내기</label>
          ${field('note', '내부 메모 (선택, Shopify 주문에 남음)')}
          <label class="check must"><input type="checkbox" name="mcf" required> 아마존 MCF 출고 취소를 먼저 확인했어요</label>`,
        summary: (f) => `${x.name} (${x.total})을 취소합니다.\n· 사유: ${CANCEL_REASONS.find(([v]) => v === f.get('reason'))[1]}\n· 환불: ${f.get('refund') ? '원결제 수단 전액' : '안 함'}\n· 재고 복원: ${f.get('restock') ? '예' : '아니오'}\n· 고객 메일: ${f.get('notify') ? '보냄' : '안 보냄'}`,
        payload: (f) => ({ reason: f.get('reason'), refund: !!f.get('refund'), restock: !!f.get('restock'), notify: !!f.get('notify'), note: f.get('note') }),
      },
      address: {
        title: `주문 ${x.name} 배송지 변경`,
        body: `
          <div class="warn-box">Shopify 주문의 배송지만 바뀌어요. 아마존 MCF로 이미 넘어간 주문은 실제 배송지가 바뀌지 않으니 출고 전인지 먼저 확인하세요.</div>
          <div class="grid2">${field('firstName', '이름 (First)', a.firstName)}${field('lastName', '성 (Last)', a.lastName)}</div>
          ${field('address1', '주소 1', a.address1, 'required')}
          ${field('address2', '주소 2 (동·호수)', a.address2)}
          <div class="grid2">${field('city', '도시', a.city, 'required')}${field('provinceCode', '주 코드 (예: TX)', a.provinceCode)}</div>
          <div class="grid2">${field('zip', '우편번호', a.zip)}${field('countryCode', '국가 코드 (예: US)', a.countryCodeV2, 'required maxlength="2"')}</div>
          ${field('phone', '전화번호 (+1…)', a.phone)}`,
        summary: (f) => `${x.name}의 배송지를 아래로 바꿉니다.\n${[f.get('firstName'), f.get('lastName')].filter(Boolean).join(' ')}\n${f.get('address1')} ${f.get('address2') || ''}\n${f.get('city')}, ${f.get('provinceCode') || ''} ${f.get('zip') || ''} ${f.get('countryCode')}`,
        payload: (f) => ({ address: Object.fromEntries(['firstName', 'lastName', 'address1', 'address2', 'city', 'provinceCode', 'zip', 'countryCode', 'phone'].map((k) => [k, k === 'countryCode' ? String(f.get(k) || '').toUpperCase() : f.get(k)])) }),
      },
      refund: {
        title: `주문 ${x.name} 환불`,
        body: `
          <div class="hint">결제 ${esc(x.total)}${x.refunded ? ` · 이미 환불 ${esc(x.refunded)}` : ''} · 원결제 수단으로 환불, 재고는 건드리지 않아요</div>
          <label class="check"><input type="radio" name="mode" value="full" checked> 남은 금액 전액 (상품 + 배송비)</label>
          <label class="check"><input type="radio" name="mode" value="amount"> 금액 지정 <input class="input" name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" style="width:110px;margin-left:6px"> ${esc(x.currency || '')}</label>
          ${field('note', '환불 사유 (Shopify 환불 메모)')}
          <label class="check"><input type="checkbox" name="notify"> Shopify 환불 안내 메일을 고객에게 보내기</label>`,
        summary: (f) => `${x.name} 환불: ${f.get('mode') === 'full' ? '남은 금액 전액 (상품 + 배송비)' : `${f.get('amount')} ${x.currency || ''}`}\n· 고객 메일: ${f.get('notify') ? '보냄' : '안 보냄'}\n\n되돌릴 수 없어요.`,
        payload: (f) => ({ full: f.get('mode') === 'full', amount: f.get('amount'), note: f.get('note'), notify: !!f.get('notify') }),
      },
      note: {
        title: `주문 ${x.name} 메모 남기기`,
        body: `<label class="field">Shopify 주문 메모에 덧붙일 내용<textarea class="textarea" name="note" required style="min-height:80px" placeholder="예: 누락 제품 MCF 재발송 요청함"></textarea></label><div class="hint">앞에 [CS 이름 · 시간]이 자동으로 붙어요.</div>`,
        summary: null,
        payload: (f) => ({ note: f.get('note') }),
      },
    };
    const spec = forms[kind];
    const key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()); // 환불 중복 실행 방지 키
    let dlg = document.getElementById('order-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'order-dialog';
      document.body.appendChild(dlg);
    }
    dlg.innerHTML = `
      <form method="dialog" class="dlg">
        <h3>${esc(spec.title)}</h3>
        <div class="dlg-body">${spec.body}</div>
        <div class="error-text" id="dlg-error"></div>
        <div class="dlg-actions">
          <button class="btn" value="cancel" formnovalidate>닫기</button>
          <button class="btn primary ${kind === 'note' ? '' : 'danger-btn'}" value="ok">${kind === 'note' ? '메모 저장' : '실행'}</button>
        </div>
      </form>`;
    const form = dlg.querySelector('form');
    form.addEventListener('submit', async (e) => {
      if (e.submitter?.value !== 'ok') return;
      e.preventDefault();
      const f = new FormData(form);
      if (spec.summary && !confirm(`${spec.summary(f)}\n\n진행할까요?`)) return;
      const btn = e.submitter;
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> 처리 중';
      try {
        const r = await api('/api/shopify', { method: 'POST', body: { action: kind, orderId: x.id, orderName: x.name, ticketId: S.selected, key, ...spec.payload(f) } });
        if (r.ticket) mergeTicket(r.ticket);
        dlg.close();
        toast(kind === 'note' ? 'Shopify 주문에 메모를 남겼습니다' : `${spec.title} 완료${r.amount && r.amount !== 'full' ? ` (${r.amount})` : ''}`);
        const id = S.selected;
        S.orders = await api(`/api/shopify?id=${encodeURIComponent(id)}`).catch((err) => ({ error: err.message }));
        if (S.selected === id) renderDetail();
      } catch (err) {
        document.getElementById('dlg-error').textContent = err.message;
        btn.disabled = false;
        btn.textContent = kind === 'note' ? '메모 저장' : '실행';
      }
    });
    dlg.showModal();
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

  // template이 있으면 그 답변 양식의 빈칸을 메일·주문 내용으로 채운다
  async function generateDraft(template) {
    const id = S.selected;
    S.composer.loading = template ? 'fill' : true;
    renderDetail();
    try {
      const d = await api('/api/ai', { method: 'POST', body: { action: 'draft', id, instruction: S.composer.instruction, ...(template ? { template } : {}) } });
      if (S.selected !== id) return;
      // 채우는 동안 담당자가 직접 고쳤으면 덮어쓰지 않는다
      if (template && ($('#reply-box')?.value ?? S.composer.text) !== template) {
        S.composer.notes = `AI 빈칸 채우기 결과는 직접 수정하셔서 반영하지 않았습니다.\n\n${d.reply}`;
        S.composer.loading = false;
        renderDetail();
        return;
      }
      Object.assign(S.composer, { text: d.reply, ko: d.ko, notes: d.notes, prefilled: 0 });
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
    const after = $('#after-status')?.value || '답변완료';
    if (mode === 'send') {
      // 안 채운 빈칸([확인 필요: …], [트래킹넘버], {name} 등)이 남아 있으면 그대로 고객에게 나가므로 한 번 막는다
      const blanks = [...new Set(text.match(/\[[^\]\n]*[가-힣][^\]\n]*\]|\{(name|order|signature)\}/g) || [])];
      const ask = blanks.length
        ? `⚠️ 아직 안 채운 빈칸이 ${blanks.length}개 있어요:\n${blanks.slice(0, 8).map((b) => `  ${b}`).join('\n')}\n\n이대로 보내면 고객에게 그대로 보입니다. 그래도 보낼까요?`
        : `${t.customer?.email} 에게 이 답장을 바로 보낼까요?\n(보낸 뒤 상태: ${after})`;
      if (!confirm(ask)) return;
    }
    S.composer.sending = true;
    S.composer.text = text;
    renderDetail();
    try {
      const r = await api('/api/send', { method: 'POST', body: { id: t.id, text, mode, status: after } });
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

  // 고객의 마지막 메일을 다른 팀 주소로 전달 (첨부 포함)
  async function forwardMail(defaultTo) {
    const t = S.tickets.find((x) => x.id === S.selected);
    if (!t) return;
    let last = '';
    try { last = localStorage.getItem('cs_last_forward') || ''; } catch {}
    const to = (prompt('전달할 이메일 주소', defaultTo || last) || '').trim();
    if (!to) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return toast('이메일 주소가 올바르지 않습니다', 'error');
    const note = prompt('같이 보낼 메모 (선택)', '') ?? null;
    if (note === null) return;
    try {
      const r = await api('/api/send', { method: 'POST', body: { id: t.id, mode: 'forward', to, note } });
      if (r.ticket) mergeTicket(r.ticket);
      try { localStorage.setItem('cs_last_forward', to); } catch {}
      toast(`${to}로 전달했습니다${r.skipped?.length ? ` (용량 때문에 첨부 ${r.skipped.length}개 제외)` : ''}`);
      renderDetail();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ---------- 동기화 ----------
  // 같은 고객의 같은 제목 메일은 서버에서 대표 티켓 하나로 묶인다 → 나머지는 목록에서 숨김
  const visible = (list) => list.filter((t) => !t.groupId);

  async function loadTickets() {
    const d = await api('/api/threads');
    S.tickets = visible(d.tickets);
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
      S.tickets = visible(d.tickets);
      S.syncedAt = d.syncedAt;
      if (!quiet) toast(d.classified ? `동기화 완료 · 새 문의 ${d.classified}건 분류` : '동기화 완료');
      setTimeout(prefillDrafts, 0);
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

  // ---------- 보낸 메일 ----------
  function renderSent() {
    S.sentDays = S.sentDays || 30;
    $('#view').innerHTML = `
      <div class="page"><div class="page-inner">
        <div class="page-head">
          <h2>보낸 메일</h2>
          <span class="hint">Gmail 보낸편지함 기준 · 대시보드에서 보낸 답장은 보낸 사람이 표시됩니다</span>
          <div class="right seg" role="group" aria-label="기간">
            ${[7, 30, 90].map((d) => `<button class="${S.sentDays === d ? 'on' : ''}" data-action="sent-days" data-days="${d}">${d}일</button>`).join('')}
          </div>
        </div>
        <div class="search">${icon.search}<input class="input" id="sent-q" placeholder="받는 사람·제목·내용 검색" value="${esc(S.sentQ || '')}"></div>
        <div class="card" id="sent-body"><div class="skeleton"><span class="spin"></span> 보낸 메일 불러오는 중…</div></div>
      </div></div>`;
    $('#sent-q').addEventListener('input', (e) => { S.sentQ = e.target.value; drawSent(); });
    if (S.sent && S.sent.days === S.sentDays) drawSent();
    loadSent();
  }

  async function loadSent() {
    const days = S.sentDays;
    try {
      const d = await api(`/api/sent?days=${days}`);
      if (S.sentDays !== days) return;
      S.sent = d;
      if (S.view === 'sent') drawSent();
    } catch (err) {
      const el = $('#sent-body');
      if (el) el.innerHTML = `<div class="card-b" style="color:var(--danger)">${esc(err.message)}</div>`;
    }
  }

  function drawSent() {
    const el = $('#sent-body');
    if (!el || !S.sent) return;
    const q = (S.sentQ || '').trim().toLowerCase();
    const items = S.sent.items.filter((m) => !q || `${m.to.map((x) => `${x.name} ${x.email}`).join(' ')} ${m.subject} ${m.snippet} ${m.by || ''}`.toLowerCase().includes(q));
    const team = S.sent.items.filter((m) => m.by).length;
    if (!items.length) {
      el.innerHTML = `<div class="card-b hint">${q ? '검색 결과가 없습니다' : `최근 ${S.sent.days}일 동안 보낸 메일이 없습니다`}</div>`;
      return;
    }
    const gmailUrl = (threadId) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(S.me.google.email || '')}#all/${encodeURIComponent(threadId)}`;
    el.innerHTML = `
      <div class="card-h">${items.length}건 <span class="hint">· 대시보드 발송 ${team}건 · Gmail 직접 발송 ${S.sent.items.length - team}건</span></div>
      <table class="tbl sent-tbl">
        <thead><tr><th>보낸 시각</th><th>받는 사람</th><th>제목 · 내용</th><th>보낸 사람</th><th></th></tr></thead>
        <tbody>
          ${items.map((m) => {
            const hasTicket = m.ticketId && S.tickets.some((t) => t.id === m.ticketId);
            return `
            <tr>
              <td class="when" title="${esc(fullDate(m.at))}">${esc(fullDate(m.at))}</td>
              <td>${m.to.map((x) => `<div class="who">${esc(x.name)}</div><div class="hint">${esc(x.email)}</div>`).join('')}</td>
              <td><div class="subj">${esc(m.subject)}</div><div class="hint snip">${esc(m.snippet)}</div></td>
              <td>${m.by ? `<span class="chip ok">${esc(m.by)}</span>` : '<span class="chip">Gmail 직접</span>'}</td>
              <td class="act">${hasTicket ? `<button class="btn sm" data-action="open-ticket" data-id="${esc(m.ticketId)}">문의 열기</button>` : `<a class="btn sm ghost" href="${gmailUrl(m.threadId)}" target="_blank" rel="noopener">Gmail에서 보기</a>`}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
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
        <div class="card" id="issues-card"></div>
        <div id="stats-body"><div class="skeleton"><span class="spin"></span> 계산 중…</div></div>
      </div></div>`;
    if (S.stats && S.stats.days === S.days) drawStats();
    loadStats();
    drawIssues();
    if (S.issues === undefined) loadIssues();
  }

  // ---------- 문제 주제 분석 (AI) ----------
  // 문의를 "아마존 배송 추적 멈춤"처럼 조치 가능한 주제로 묶는다. 결과는 저장돼 팀 전체가 같이 본다.
  async function loadIssues() {
    try {
      S.issues = await api('/api/stats?analysis=1');
    } catch {
      S.issues = null;
    }
    if (S.view === 'stats') drawIssues();
  }

  async function runIssues() {
    S.issuesRunning = true;
    drawIssues();
    try {
      S.issues = await api(`/api/stats?analysis=1&days=${S.days}`, { method: 'POST', body: {} });
      toast(`문의 ${S.issues.count}건을 ${S.issues.themes.length}개 주제로 분석했습니다`);
    } catch (err) {
      toast(err.message, 'error');
    }
    S.issuesRunning = false;
    if (S.view === 'stats') drawIssues();
  }

  function drawIssues() {
    const el = $('#issues-card');
    if (!el) return;
    const r = S.issues;
    const btn = `<button class="btn sm ${r ? '' : 'primary'}" data-action="run-issues" ${S.issuesRunning ? 'disabled' : ''}>${S.issuesRunning ? '<span class="spin"></span> 분석 중 (30초쯤)' : `${icon.spark} 최근 ${S.days}일 ${r ? '다시 ' : ''}분석`}</button>`;
    const head = `<div class="card-h">무슨 문제가 가장 많았나 <span class="hint">· AI 문제 주제 분석</span><span class="spacer"></span>${btn}</div>`;
    if (!r) {
      el.innerHTML = `${head}<div class="card-b hint">${S.issues === undefined ? '<span class="spin"></span> 불러오는 중…' : '버튼을 누르면 최근 문의를 "배송"처럼 넓은 유형이 아니라 "아마존 배송 추적 멈춤"처럼 구체적인 문제 주제로 묶어 보여줍니다. 결과는 저장돼 팀 전체가 같이 봐요.'}</div>`;
      return;
    }
    const byCat = {};
    for (const t of r.themes) byCat[t.category] = (byCat[t.category] || 0) + t.ids.length;
    const max = Math.max(1, ...r.themes.map((t) => t.ids.length));
    const ticketOf = (id) => S.tickets.find((x) => x.id === id || x.related?.includes(id));
    el.innerHTML = `${head}
      <div class="card-b issues">
        <div class="hint">문의 ${r.count}건 (${esc(r.from)} ~ ${esc(r.to)}, 스팸·자동 알림 제외) · ${esc(r.by)} 님이 ${ago(r.at)} 분석 · 원인은 메일 내용에서 AI가 추정한 것이에요</div>
        <div class="issue-cats">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `<span class="chip">${esc(c)} <b>${n}</b></span>`).join('')}</div>
        ${r.notes ? `<div class="issue-notes">${esc(r.notes)}</div>` : ''}
        ${r.themes.map((t, i) => {
          const list = t.ids.map(ticketOf).filter(Boolean);
          const urgent = list.filter((x) => x.priority === '긴급').length;
          return `
          <details class="issue">
            <summary>
              <span class="rank">${i + 1}</span>
              <span class="i-title"><span class="chip">${esc(t.category)}</span> ${esc(t.theme)}</span>
              <span class="i-bar"><span style="width:${(t.ids.length / max) * 100}%"></span></span>
              <span class="i-n">${t.ids.length}건${urgent ? ` <span class="chip danger">긴급 ${urgent}</span>` : ''}</span>
            </summary>
            <dl class="kv">
              <dt>문제</dt><dd>${esc(t.what)}</dd>
              <dt>원인 추정</dt><dd>${esc(t.cause)}</dd>
              <dt>줄이려면</dt><dd>${esc(t.action)}</dd>
            </dl>
            <div class="i-list">${list.map((x) => `<button class="ch-row" data-action="open-ticket" data-id="${esc(x.id)}"><span class="chip ${STATUS_CHIP[x.status]}">${esc(x.status)}</span><span class="ch-subj">${esc(x.summary || x.subject)}</span><span class="hint">${esc(x.customer?.name || '')} · ${esc(fullDate(x.firstAt))}</span></button>`).join('') || '<span class="hint">목록에서 찾을 수 없는 문의예요 (보관 기간이 지났을 수 있어요)</span>'}</div>
          </details>`;
        }).join('')}
      </div>`;
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
        <div class="tiles">
          <div class="tile"><div class="lbl">고객 회신 대기</div><div class="val">${s.waiting ?? 0}<small>건</small></div><div class="sub">회신 없으면 자동으로 다시 열림</div></div>
          <div class="tile"><div class="lbl">팔로업 필요</div><div class="val">${s.followups ?? 0}<small>건</small></div><div class="sub">고객 대기 중 회신이 없던 건</div></div>
          <div class="tile"><div class="lbl">아마존 주문 문의</div><div class="val">${s.amazon ?? 0}<small>건</small></div><div class="sub">최근 ${s.days}일</div></div>
          <div class="tile"><div class="lbl">자동 종결 (알림 메일)</div><div class="val">${s.autoClosed ?? 0}<small>건</small></div><div class="sub">최근 ${s.days}일</div></div>
        </div>
        <div class="grid-2">
          <div class="card">
            <div class="card-h">유형별 첫 응답 시간</div>
            <table class="tbl">
              <thead><tr><th>유형</th><th class="num">건수</th><th class="num">평균 첫 응답</th></tr></thead>
              <tbody>
                ${(s.byTypeResponse || []).map((r) => `<tr><td>${esc(r.type)}</td><td class="num">${r.count}</td><td class="num">${hours(r.avgHours)}</td></tr>`).join('') || '<tr><td colspan="3" class="hint">데이터 없음</td></tr>'}
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="card-h">반복 문의 고객 <span class="right hint">기간 안에 2번 이상</span></div>
            <table class="tbl">
              <thead><tr><th>고객</th><th class="num">문의</th></tr></thead>
              <tbody>
                ${(s.repeatCustomers || []).map((c) => `<tr><td><b>${esc(c.name || c.email)}</b><div class="hint">${esc(c.email)}</div></td><td class="num">${c.count}</td></tr>`).join('') || '<tr><td colspan="2" class="hint">반복 문의한 고객이 없습니다</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="card-h">제품별 문제 문의 <span class="right hint">${esc((s.problemTypes || []).join(' · '))} 유형 · AI가 찾은 제품 또는 주문 상품 기준</span></div>
          <table class="tbl">
            <thead><tr><th>제품</th><th class="num">합계</th>${(s.problemTypes || []).map((p) => `<th class="num">${esc(p)}</th>`).join('')}</tr></thead>
            <tbody>
              ${(s.byProduct || []).map((r) => `<tr><td>${esc(r.product)}</td><td class="num"><b>${r.total}</b></td>${(s.problemTypes || []).map((p) => `<td class="num">${r.byType[p] || ''}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${2 + (s.problemTypes || []).length}" class="hint">아직 제품이 확인된 문제 문의가 없습니다 (새로 들어오는 문의부터 집계돼요)</td></tr>`}
            </tbody>
          </table>
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
              <div class="conn">
                <div><div class="name">슬랙 알림</div><div class="desc">${S.me.slack?.enabled ? '긴급 문의 · 24시간 미답변 · 배정 알림 · 매일 오전 9시 요약' : 'Vercel 환경변수 SLACK_WEBHOOK_URL (Incoming Webhook) 필요'}</div></div>
                <div class="right">${S.me.slack?.enabled ? '<span class="chip ok">사용 중</span>' : '<span class="chip">미설정</span>'}</div>
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
                <label class="field">자동 종결할 발신자 (알림·자동 발송 메일)
                  <textarea class="textarea" id="s-autoclose" style="min-height:110px">${esc((st.autoClose || []).join('\n'))}</textarea>
                  <span class="hint">한 줄에 하나. <code>no-reply@</code> = 이 아이디로 시작 · <code>facebookmail.com</code> = 그 도메인 · 전체 주소 = 그 주소만. 들어오면 AI 분류 없이 바로 '종결'됩니다.</span>
                </label>
                <label class="field">고객 대기 → 팔로업 기한 (일)
                  <input class="input" id="s-followup" type="number" min="1" max="30" value="${esc(st.followupDays || 3)}" style="width:100px">
                  <span class="hint">'고객 대기'로 둔 문의에 이 기간 동안 고객 회신이 없으면 '팔로업 필요'로 다시 처리 목록에 올립니다.</span>
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
              <label class="check"><input type="checkbox" id="s-autodraft" ${st.autoDraft !== false ? 'checked' : ''}> 새 문의가 들어오면 AI 초안을 미리 만들어 두기 <span class="hint">(문의 1건당 AI 호출 1번 · 답장 필요한 문의만)</span></label>
              <label class="field">서명
                <textarea class="textarea" id="s-signature" style="min-height:70px">${esc(st.signature)}</textarea>
              </label>
              <div style="display:flex;justify-content:flex-end"><button class="btn primary" data-action="save-settings">저장</button></div>
            </div>
          </div>
        </div>
        <div class="card tpl-card">
          <div class="card-h">자주 쓰는 답변
            <span class="hint">· {name} 고객 이름 · {order} 주문번호 · {signature} 서명 · [확인 필요: …]는 보낼 때 채우기</span>
            <span class="spacer"></span>
            <button class="btn sm" data-action="tpl-add">+ 답변 추가</button>
          </div>
          <div id="tpl-list">${(st.templates || []).map((x) => templateEditor(x)).join('')}</div>
          <div class="tpl-foot"><span class="hint">답장 작성창의 '자주 쓰는 답변 넣기'에 나오고, AI 초안도 이 답변들을 참고합니다.</span><button class="btn primary" data-action="save-settings">저장</button></div>
        </div>
      </div></div>`;
  }

  function templateEditor(x, open = false) {
    return `
      <details class="tpl-item" data-id="${esc(x.id || '')}" ${open ? 'open' : ''}>
        <summary><span class="chip">${esc(x.cat)}</span> ${esc(x.title)}</summary>
        <div class="tpl-fields">
          <input class="input tpl-cat" value="${esc(x.cat)}" placeholder="분류 (예: 제품 FAQ)">
          <input class="input tpl-title" value="${esc(x.title)}" placeholder="제목">
          <input class="input tpl-types" value="${esc((x.types || []).join(', '))}" placeholder="추천할 문의 유형 (예: 배송, 교환/환불)">
          <button class="btn sm ghost danger" data-action="tpl-del">삭제</button>
        </div>
        <textarea class="textarea tpl-body">${esc(x.body)}</textarea>
        <div class="tpl-extra">
          <input class="input tpl-action" value="${esc(x.action || '')}" placeholder="처리할 일 (담당자용 메모, 고객에게 안 보냄) 예: Shopify에서 Cancel order">
          <input class="input tpl-forward" value="${esc(x.forward || '')}" placeholder="전달 버튼 주소 (선택) 예: global_sales@neosimplix.com">
          <label class="hint">보낸 뒤 상태
            <select class="select tpl-after">
              ${[['', '답변완료 (기본)'], ['고객 대기', '고객 대기 (회신 오면 다시 열림)'], ['진행중', '진행중'], ['종결', '종결']].map(([v, l]) => `<option value="${v}" ${(x.after || '') === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
        </div>
      </details>`;
  }

  function collectTemplates() {
    return [...document.querySelectorAll('#tpl-list .tpl-item')].map((el) => ({
      id: el.dataset.id,
      cat: el.querySelector('.tpl-cat').value,
      title: el.querySelector('.tpl-title').value,
      types: el.querySelector('.tpl-types').value.split(',').map((s) => s.trim()).filter(Boolean),
      body: el.querySelector('.tpl-body').value,
      action: el.querySelector('.tpl-action').value,
      forward: el.querySelector('.tpl-forward').value.trim(),
      after: el.querySelector('.tpl-after').value,
    }));
  }

  async function saveSettings() {
    try {
      S.settings = await api('/api/settings', {
        method: 'POST',
        body: {
          query: $('#s-query').value,
          aliases: $('#s-aliases').value.split(',').map((s) => s.trim()).filter(Boolean),
          autoClose: $('#s-autoclose').value.split('\n').map((s) => s.trim()).filter(Boolean),
          followupDays: Number($('#s-followup').value) || 3,
          guide: $('#s-guide').value,
          signature: $('#s-signature').value,
          autoDraft: $('#s-autodraft').checked,
          templates: collectTemplates(),
        },
      });
      $('#tpl-list').innerHTML = (S.settings.templates || []).map((x) => templateEditor(x)).join('');
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
    } else if (a === 'pick') {
      if (el.checked) S.bulk.add(el.dataset.id);
      else S.bulk.delete(el.dataset.id);
      el.closest('.item')?.classList.toggle('picked', el.checked);
      renderBulkBar();
    } else if (a === 'bulk-all') {
      filtered().forEach((t) => S.bulk.add(t.id));
      renderList();
    } else if (a === 'bulk-clear') {
      S.bulk.clear();
      renderList();
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
    else if (a === 'forward') forwardMail(el.dataset.to);
    else if (a === 'order-act') openOrderAction(el.dataset.kind, Number(el.dataset.idx));
    else if (a === 'tpl-insert') insertTemplate(el.dataset.id);
    else if (a === 'run-issues') runIssues();
    else if (a === 'days') {
      S.days = Number(el.dataset.days);
      renderStats();
    } else if (a === 'sent-days') {
      S.sentDays = Number(el.dataset.days);
      renderSent();
    } else if (a === 'open-ticket') {
      S.view = 'inbox';
      renderView();
      openTicket(el.dataset.id);
    } else if (a === 'save-settings') saveSettings();
    else if (a === 'tpl-add') {
      $('#tpl-list').insertAdjacentHTML('beforeend', templateEditor({ cat: '기타', title: '새 답변', body: 'Hi {name},\n\n\n\n{signature}', types: [] }, true));
      $('#tpl-list .tpl-item:last-child .tpl-title').select();
    } else if (a === 'tpl-del') {
      const item = el.closest('.tpl-item');
      if (confirm(`'${item.querySelector('.tpl-title').value}' 답변을 삭제할까요? (저장을 눌러야 반영됩니다)`)) item.remove();
    }
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
    loadSettings();
    try {
      await loadTickets();
      setTimeout(prefillDrafts, 0);
      if (S.view === 'inbox') renderList();
    } catch (err) {
      toast(err.message, 'error');
    }
    // 슬랙 알림 링크(/?t=티켓ID)로 들어오면 그 문의를 바로 연다
    const deep = params.get('t');
    if (deep) {
      history.replaceState(null, '', location.pathname);
      const t = S.tickets.find((x) => x.id === deep) || S.tickets.find((x) => x.related?.includes(deep));
      if (t) {
        S.view = 'inbox';
        renderView();
        openTicket(t.id);
      }
    }
    // 마지막 동기화가 3분 넘었으면 자동으로 새 메일 가져오기
    if (Date.now() - S.syncedAt > 3 * 60_000) sync({ quiet: true });
  }

  boot();
})();
