/**
 * 온라인 계정 / 랭킹 UI (CloudUI)
 * - 홈 프로필 카드의 계정 줄(#account-row), 로그인·회원가입 모달, 랭킹 모달을 담당한다.
 * - 모든 문자열은 textContent 로만 넣는다 (다른 사람 닉네임이 들어오므로 innerHTML 금지).
 */

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function maskEmail(email) {
  const [id = '', host = ''] = String(email || '').split('@');
  return `${id.slice(0, 2)}${'*'.repeat(Math.max(1, Math.min(4, id.length - 2)))}@${host}`;
}

export class CloudUI {
  /**
   * @param {HTMLElement} overlay UIManager 오버레이 루트
   * @param {{cloud: import('./CloudSync.js').CloudSync, characters: Object, onChanged: Function}} opts
   */
  constructor(overlay, { cloud, characters, onChanged }) {
    this.cloud = cloud;
    this.characters = characters;
    this.onChanged = onChanged || (() => {});
    this.overlay = overlay;
    this.mode = 'login';
    this._busy = false;

    this.accountRow = overlay.querySelector('#account-row');
    this.rankBtn = overlay.querySelector('#btn-ready-rank');

    this._buildAuth();
    this._buildRank();

    this.rankBtn?.addEventListener('click', () => this.openRank());
    this._onKey = (e) => {
      if (e.code !== 'Escape') return;
      if (this.isOpen()) { e.stopPropagation(); this.closeAll(); }
    };
    window.addEventListener('keydown', this._onKey, true);

    cloud.onChange(() => this.refresh());
    this.refresh();
  }

  isOpen() {
    return this.authModal.style.display !== 'none' || this.rankModal.style.display !== 'none';
  }
  closeAll() {
    this.authModal.style.display = 'none';
    this.rankModal.style.display = 'none';
  }

  // ---------------------------------------------------------------------------
  // 홈 화면: 계정 줄 + 랭킹 버튼
  // ---------------------------------------------------------------------------

  refresh() {
    const c = this.cloud;
    if (this.rankBtn) {
      this.rankBtn.disabled = false;
      this.rankBtn.classList.add('ui-interactive');
      this.rankBtn.classList.remove('ui-btn-subtle');
      this.rankBtn.classList.add('ui-btn-secondary');
      this.rankBtn.textContent = c.enabled ? '🏆 랭킹' : '🏆 랭킹 (준비 중)';
    }
    const row = this.accountRow;
    if (!row) return;
    row.replaceChildren();
    if (!c.enabled) {
      row.append(el('span', 'account-note', '☁ 온라인 기능 준비 중'));
      return;
    }
    if (c.status === 'loading') { row.append(el('span', 'account-note', '☁ 연결 중…')); return; }
    if (c.status === 'error') { row.append(el('span', 'account-note', '☁ 오프라인 (연결 실패)')); return; }
    if (!c.signedIn) {
      const b = el('button', 'ui-btn ui-btn-secondary ui-interactive account-btn', '☁ 로그인 / 가입');
      b.addEventListener('click', () => this.openAuth('login'));
      row.append(el('span', 'account-note', '로그인하면 기록이 저장돼요'), b);
      return;
    }
    const st = { ok: '☁ 저장됨', pending: '☁ 저장 대기…', syncing: '☁ 저장 중…', offline: '☁ 오프라인 — 나중에 저장', idle: '☁ 연결됨' }[c.syncState] || '☁';
    const out = el('button', 'account-out ui-interactive', '로그아웃');
    out.addEventListener('click', () => this._logout());
    const info = el('div', 'account-info');
    info.append(el('span', `account-note sync-${c.syncState}`, st), el('span', 'account-mail', maskEmail(c.user?.email)));
    row.append(info, out);
  }

  async _logout() {
    let r = await this.cloud.signOut();
    if (!r.ok && r.unsynced) {
      if (!window.confirm('아직 서버에 저장되지 않은 기록이 있어요.\n그래도 로그아웃하면 이 기기의 기록은 사라져요. 계속할까요?')) return;
      r = await this.cloud.signOut(true);
    }
    if (!r.ok && r.message) window.alert(r.message);
  }

  // ---------------------------------------------------------------------------
  // 로그인 / 가입 모달
  // ---------------------------------------------------------------------------

  _buildAuth() {
    const wrap = el('div', 'ui-modal-wrapper');
    wrap.id = 'modal-auth';
    wrap.style.display = 'none';
    const panel = el('div', 'ui-panel auth-panel');
    panel.append(el('h2', 'ui-title', '☁ 내 계정'));

    const tabs = el('div', 'shop-tabs');
    this.tabLogin = el('button', 'shop-tab ui-interactive', '로그인');
    this.tabSignup = el('button', 'shop-tab ui-interactive', '회원가입');
    this.tabLogin.addEventListener('click', () => this._setMode('login'));
    this.tabSignup.addEventListener('click', () => this._setMode('signup'));
    tabs.append(this.tabLogin, this.tabSignup);

    const form = el('form', 'auth-form');
    form.noValidate = true;
    const field = (label, type, ph, ac) => {
      const w = el('label', 'auth-field');
      w.append(el('span', null, label));
      const i = el('input', 'auth-input ui-interactive');
      i.type = type; i.placeholder = ph; i.autocomplete = ac; i.spellcheck = false;
      w.append(i);
      return [w, i];
    };
    [this.nickWrap, this.nickIn] = field('닉네임 (랭킹에 표시돼요)', 'text', '최대 12글자', 'nickname');
    this.nickIn.maxLength = 24;
    [this.mailWrap, this.mailIn] = field('이메일', 'email', 'name@example.com', 'email');
    [this.pwWrap, this.pwIn] = field('비밀번호', 'password', '6자 이상', 'current-password');
    this.msg = el('div', 'auth-msg');
    this.submit = el('button', 'ui-btn ui-btn-primary ui-interactive', '로그인');
    this.submit.type = 'submit';
    this.reset = el('button', 'auth-link ui-interactive', '비밀번호를 잊었어요');
    this.reset.type = 'button';
    this.reset.addEventListener('click', () => this._reset());
    const close = el('button', 'ui-btn ui-btn-subtle ui-interactive', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => this.closeAll());
    form.append(this.nickWrap, this.mailWrap, this.pwWrap, this.msg, this.submit, this.reset, close);
    form.addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });

    // 게임 키(스페이스/방향키/엔터)가 입력창에서 새지 않게
    form.addEventListener('keydown', (e) => { if (e.code !== 'Escape') e.stopPropagation(); });

    panel.append(tabs, form);
    wrap.append(panel);
    this.overlay.append(wrap);
    this.authModal = wrap;
  }

  _setMode(m) {
    this.mode = m;
    const su = m === 'signup';
    this.tabLogin.classList.toggle('active', !su);
    this.tabSignup.classList.toggle('active', su);
    this.nickWrap.style.display = su ? '' : 'none';
    this.reset.style.display = su ? 'none' : '';
    this.pwIn.autocomplete = su ? 'new-password' : 'current-password';
    this.submit.textContent = su ? '가입하고 시작' : '로그인';
    this._say('');
  }

  _say(t, ok = false) {
    this.msg.textContent = t;
    this.msg.classList.toggle('ok', ok);
  }

  openAuth(mode = 'login') {
    if (!this.cloud.enabled) return;
    this.rankModal.style.display = 'none';
    this.authModal.style.display = 'flex';
    this.pwIn.value = '';
    this._setMode(mode);
    (mode === 'signup' ? this.nickIn : this.mailIn).focus();
  }

  async _submit() {
    if (this._busy) return;
    const email = this.mailIn.value.trim();
    const pw = this.pwIn.value;
    if (!email || !pw) { this._say('이메일과 비밀번호를 입력해 주세요'); return; }
    this._busy = true;
    this.submit.disabled = true;
    this._say('잠시만요…', true);
    const r = this.mode === 'signup'
      ? await this.cloud.signUp(email, pw, this.nickIn.value)
      : await this.cloud.signIn(email, pw);
    this._busy = false;
    this.submit.disabled = false;
    if (!r.ok) { this._say(r.message); return; }
    this.pwIn.value = '';
    this.authModal.style.display = 'none';
    this.onChanged();
  }

  async _reset() {
    const email = this.mailIn.value.trim();
    if (!email) { this._say('위에 이메일을 먼저 입력해 주세요'); return; }
    const r = await this.cloud.resetPassword(email);
    this._say(r.ok ? '비밀번호 재설정 메일을 보냈어요 (스팸함도 확인!)' : r.message, r.ok);
  }

  // ---------------------------------------------------------------------------
  // 랭킹 모달
  // ---------------------------------------------------------------------------

  _buildRank() {
    const wrap = el('div', 'ui-modal-wrapper');
    wrap.id = 'modal-rank';
    wrap.style.display = 'none';
    const panel = el('div', 'ui-panel rank-panel');
    const head = el('div', 'shop-head');
    head.append(el('h2', 'ui-title', '🏆 랭킹'));
    this.rankMine = el('div', 'rank-mine');
    head.append(this.rankMine);
    this.rankList = el('div', 'rank-list');
    const btns = el('div', 'panel-buttons');
    const refresh = el('button', 'ui-btn ui-btn-secondary ui-interactive', '새로고침');
    refresh.addEventListener('click', () => this._loadRank());
    const close = el('button', 'ui-btn ui-btn-subtle ui-interactive', '닫기');
    close.addEventListener('click', () => this.closeAll());
    btns.append(refresh, close);
    panel.append(head, this.rankList, btns);
    wrap.append(panel);
    this.overlay.append(wrap);
    this.rankModal = wrap;
  }

  openRank() {
    if (!this.cloud.enabled) {
      this.rankModal.style.display = 'flex';
      this.rankMine.textContent = '';
      this.rankList.replaceChildren(el('div', 'rank-empty', '온라인 랭킹은 준비 중이에요.'));
      return;
    }
    if (!this.cloud.signedIn) { this.openAuth('login'); return; }
    this.authModal.style.display = 'none';
    this.rankModal.style.display = 'flex';
    this._loadRank();
  }

  async _loadRank() {
    this.rankMine.textContent = '';
    this.rankList.replaceChildren(el('div', 'rank-empty', '불러오는 중…'));
    const r = await this.cloud.leaderboard(30);
    if (this.rankModal.style.display === 'none') return;
    if (!r.ok) { this.rankList.replaceChildren(el('div', 'rank-empty', r.message)); return; }
    if (!r.rows.length) { this.rankList.replaceChildren(el('div', 'rank-empty', '아직 기록이 없어요. 첫 번째 주인공이 되어보세요!')); return; }
    if (r.myRank) this.rankMine.textContent = `내 순위 ${r.myRank}위`;
    const medal = ['🥇', '🥈', '🥉'];
    const rows = r.rows.map((x, i) => {
      const row = el('div', `rank-row${x.uid === r.myUid ? ' me' : ''}`);
      const ch = this.characters?.get(x.characterId);
      const face = el('span', 'rank-face');
      if (ch) face.style.backgroundImage = `url("${ch.SRC}")`;
      row.append(
        el('span', 'rank-no', i < 3 ? medal[i] : String(i + 1)),
        face,
        el('span', 'rank-name', x.nickname || '이름없음'),
        el('b', 'rank-score', Number(x.bestScore || 0).toLocaleString('ko-KR')),
      );
      return row;
    });
    this.rankList.replaceChildren(...rows);
  }

  destroy() { window.removeEventListener('keydown', this._onKey, true); }
}
