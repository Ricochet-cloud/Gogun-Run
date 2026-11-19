import { isFirebaseConfigured } from '../../config/firebase.config.js';
import { CHARACTER_STORAGE_KEY } from '../../config/characters.config.js';
import { ProfileManager, PROFILE_STORAGE_KEY } from './ProfileManager.js';
import { SHOP_STORAGE_KEY } from './ShopManager.js';

const SAFE_ID = /^[A-Za-z0-9_]+$/;
const strs = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && SAFE_ID.test(x)).slice(0, 200) : []);
const num = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** 오류 코드를 사람이 읽을 한국어 문장으로 */
export function humanizeError(e) {
  const code = String(e?.code || e?.message || '');
  const map = {
    'auth/email-already-in-use': '이미 가입된 이메일이에요. 로그인해 주세요',
    'auth/invalid-email': '이메일 형식이 올바르지 않아요',
    'auth/weak-password': '비밀번호는 6자 이상이어야 해요',
    'auth/missing-password': '비밀번호를 입력해 주세요',
    'auth/user-not-found': '가입되지 않은 이메일이에요',
    'auth/wrong-password': '비밀번호가 맞지 않아요',
    'auth/invalid-credential': '이메일 또는 비밀번호가 맞지 않아요',
    'auth/too-many-requests': '시도가 너무 많아요. 잠시 뒤에 다시 해주세요',
    'auth/network-request-failed': '인터넷 연결을 확인해 주세요',
    'auth/operation-not-allowed': '이메일 로그인이 아직 켜져 있지 않아요 (Firebase 설정 필요)',
    'unavailable': '서버에 연결할 수 없어요. 인터넷을 확인해 주세요',
    'permission-denied': '서버가 요청을 거절했어요 (보안 규칙 확인 필요)',
  };
  for (const k of Object.keys(map)) if (code.includes(k)) return map[k];
  return '문제가 생겼어요. 잠시 뒤에 다시 해주세요';
}

/**
 * 온라인 계정/동기화 관리자.
 * - 로컬 우선: 게임은 항상 localStorage 로 동작하고, 로그인하면 같은 데이터를 Firestore 에도 저장한다.
 * - 로그인 시: 서버에 데이터가 있으면 서버 기준으로 불러오고(최고 점수/통계는 큰 쪽 유지), 없으면(첫 가입) 이 기기의 기록을 올린다.
 * - 저장 시: 상점/프로필/캐릭터가 바뀔 때마다 2.5초 묶어서 업로드, 한 판이 끝나면 즉시 업로드.
 */
export class CloudSync {
  /**
   * @param {{profile: Object, shop: Object, characters: Object, scoreManager: Object}} deps
   */
  constructor({ profile, shop, characters, scoreManager }) {
    this.profile = profile;
    this.shop = shop;
    this.characters = characters;
    this.scoreManager = scoreManager;

    this.backend = null;
    /** 'disabled' | 'loading' | 'signed-out' | 'signed-in' | 'error' */
    this.status = 'disabled';
    /** 'idle' | 'pending' | 'syncing' | 'ok' | 'offline' */
    this.syncState = 'idle';
    this.user = null;
    this.listeners = new Set();
    /** 서버 데이터가 로컬에 반영된 뒤 호출 (UI 새로고침용) */
    this.onApplied = null;

    this._applying = false;
    this._pushTimer = 0;
    this._flushing = false;
    this._again = false;
    this._lbSig = '';
    this._pendingNick = null;

    const hook = () => { if (!this._applying) this.schedulePush(); };
    profile.onSaved = hook;
    shop.onSaved = hook;
    characters.onSelected = hook;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
    }
  }

  get enabled() { return this.status !== 'disabled'; }
  get signedIn() { return this.status === 'signed-in'; }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { for (const fn of this.listeners) fn(); }

  // ---------------------------------------------------------------------------
  // 시작
  // ---------------------------------------------------------------------------

  async init() {
    const mock = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cloud') === 'mock';
    if (!mock && !isFirebaseConfigured()) { this.status = 'disabled'; this._emit(); return; }
    this.status = 'loading';
    this._emit();
    try {
      if (mock) {
        const { MemoryBackend } = await import('./cloud/MemoryBackend.js');
        this.backend = new MemoryBackend();
      } else {
        const { FirebaseBackend } = await import('./cloud/FirebaseBackend.js');
        this.backend = new FirebaseBackend();
      }
      await this.backend.init();
      this.backend.onAuth((u) => this._onAuth(u));
    } catch (e) {
      console.warn('[CloudSync] 온라인 기능을 시작하지 못했어요 — 오프라인으로 계속합니다:', e?.message || e);
      this.status = 'error';
      this._emit();
    }
  }

  async _onAuth(user) {
    this.user = user;
    if (!user) { this.status = 'signed-out'; this.syncState = 'idle'; this._emit(); return; }
    this.status = 'signed-in';
    if (this._pendingNick) { this.profile.setNickname(this._pendingNick); this._pendingNick = null; }
    this._emit();
    await this._pull();
  }

  // ---------------------------------------------------------------------------
  // 계정
  // ---------------------------------------------------------------------------

  async signUp(email, password, nickname) {
    const nick = ProfileManager.sanitizeNickname(nickname);
    if (!nick) return { ok: false, message: '닉네임을 입력해 주세요' };
    this._pendingNick = nick;
    try {
      await this.backend.signUp(String(email).trim(), password);
      return { ok: true };
    } catch (e) {
      this._pendingNick = null;
      return { ok: false, message: humanizeError(e) };
    }
  }

  async signIn(email, password) {
    try {
      await this.backend.signIn(String(email).trim(), password);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: humanizeError(e) };
    }
  }

  async resetPassword(email) {
    try {
      await this.backend.resetPassword(String(email).trim());
      return { ok: true };
    } catch (e) {
      return { ok: false, message: humanizeError(e) };
    }
  }

  /**
   * 로그아웃. 다른 계정에 기록이 섞이지 않도록 이 기기의 로컬 기록을 지우고 새로고침한다.
   * 마지막 업로드가 실패한 상태면 {ok:false, unsynced:true} 를 돌려주고, force=true 로 다시 부르면 그대로 진행.
   */
  async signOut(force = false) {
    clearTimeout(this._pushTimer);
    if (!force) {
      await this.flush();
      if (this.syncState === 'offline') return { ok: false, unsynced: true };
    }
    try { await this.backend.signOut(); } catch (e) { return { ok: false, message: humanizeError(e) }; }
    this.wiping = true;   // 새로고침 중 pagehide 저장이 지운 기록을 되살리지 않게
    try {
      for (const k of [PROFILE_STORAGE_KEY, SHOP_STORAGE_KEY, CHARACTER_STORAGE_KEY, this.scoreManager.storageKey]) localStorage.removeItem(k);
    } catch (e) { /* 무시 */ }
    if (typeof location !== 'undefined') location.reload();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // 동기화
  // ---------------------------------------------------------------------------

  /** 지금 이 기기의 데이터를 서버 문서 모양으로 */
  _snapshot() {
    const s = this.shop.state;
    const eq = s.equipped || {};
    return {
      nickname: this.profile.nickname,
      createdAt: num(this.profile.state.createdAt),
      bestScore: num(this.scoreManager.bestScore),
      runs: num(this.profile.state.runs),
      nearMisses: num(this.profile.state.nearMisses),
      coinsEarned: num(this.profile.state.coinsEarned),
      coins: num(s.coins),
      ownedCharacters: strs(s.ownedCharacters),
      ownedItems: strs(s.ownedItems),
      equipped: {
        trail: String(eq.trail || ''), rope: String(eq.rope || ''), effect: String(eq.effect || ''), pet: String(eq.pet || ''),
      },
      selectedCharacter: String(this.characters.getSelected()?.ID || ''),
    };
  }

  /** 서버 데이터를 이 기기에 적용 (서버 기준, 최고 점수·통계는 더 큰 값 유지) */
  _applyCloud(c) {
    this._applying = true;
    try {
      const ps = this.profile.state;
      const nick = ProfileManager.sanitizeNickname(c.nickname);
      if (nick) ps.nickname = nick;
      ps.runs = Math.max(num(ps.runs), num(c.runs));
      ps.nearMisses = Math.max(num(ps.nearMisses), num(c.nearMisses));
      ps.coinsEarned = Math.max(num(ps.coinsEarned), num(c.coinsEarned));
      this.profile.save();

      const eq = c.equipped && typeof c.equipped === 'object' ? c.equipped : {};
      this.shop.state = {
        coins: num(c.coins),
        ownedCharacters: strs(c.ownedCharacters),
        ownedItems: strs(c.ownedItems),
        equipped: {
          trail: typeof eq.trail === 'string' && eq.trail ? eq.trail : this.shop.state.equipped.trail,
          rope: typeof eq.rope === 'string' && eq.rope ? eq.rope : this.shop.state.equipped.rope,
          effect: typeof eq.effect === 'string' && eq.effect ? eq.effect : this.shop.state.equipped.effect,
          pet: typeof eq.pet === 'string' && eq.pet ? eq.pet : null,
        },
      };
      this.shop._sanitizeEquipped();
      this.shop.save();

      const sm = this.scoreManager;
      if (num(c.bestScore) > sm.highScore) { sm.highScore = num(c.bestScore); sm._saveHighScore(sm.highScore); }

      if (typeof c.selectedCharacter === 'string' && c.selectedCharacter) this.characters.select(c.selectedCharacter);
    } finally {
      this._applying = false;
    }
  }

  async _pull() {
    if (!this.user) return;
    this.syncState = 'syncing';
    this._emit();
    try {
      const cloud = await this.backend.getUser(this.user.uid);
      if (cloud) {
        this._applyCloud(cloud);
        if (this.onApplied) this.onApplied();
      }
      await this._push();        // 첫 가입이면 이 기기 기록 업로드 / 아니면 합쳐진 최고 점수·랭킹 반영
      this.syncState = 'ok';
    } catch (e) {
      console.warn('[CloudSync] 불러오기 실패:', e?.code || e?.message || e);
      this.syncState = 'offline';
    }
    this._emit();
  }

  async _push() {
    const snap = this._snapshot();
    await this.backend.setUser(this.user.uid, snap);
    // 랭킹 문서: 닉네임/최고점/캐릭터가 바뀐 경우에만 갱신
    const sig = `${snap.nickname}|${snap.bestScore}|${snap.selectedCharacter}`;
    if (snap.bestScore > 0 && sig !== this._lbSig) {
      await this.backend.setLeaderboard(this.user.uid, {
        nickname: snap.nickname, bestScore: snap.bestScore, characterId: snap.selectedCharacter,
      });
      this._lbSig = sig;
    }
  }

  schedulePush(delay = 2500) {
    if (!this.signedIn || this._applying) return;
    clearTimeout(this._pushTimer);
    this.syncState = 'pending';
    this._emit();
    this._pushTimer = setTimeout(() => this.flush(), delay);
  }

  /** 즉시 업로드 (한 판이 끝났을 때 등). 실패하면 15초 뒤 다시 시도 */
  async flush() {
    clearTimeout(this._pushTimer);
    if (!this.signedIn) return;
    if (this._flushing) { this._again = true; return; }
    this._flushing = true;
    this.syncState = 'syncing';
    this._emit();
    try {
      await this._push();
      this.syncState = 'ok';
    } catch (e) {
      console.warn('[CloudSync] 저장 실패 — 나중에 다시 시도해요:', e?.code || e?.message || e);
      this.syncState = 'offline';
      this._pushTimer = setTimeout(() => this.flush(), 15000);
    }
    this._flushing = false;
    this._emit();
    if (this._again) { this._again = false; this.flush(); }
  }

  /** 판이 끝났을 때 호출 */
  onRunFinished() { return this.flush(); }

  // ---------------------------------------------------------------------------
  // 랭킹
  // ---------------------------------------------------------------------------

  /** @returns {Promise<{ok:boolean, rows?:Array, myRank?:number|null, message?:string}>} */
  async leaderboard(n = 30) {
    if (!this.signedIn) return { ok: false, message: '로그인하면 랭킹을 볼 수 있어요' };
    try {
      await this.flush();                       // 방금 판 기록이 반영된 뒤 조회
      const rows = await this.backend.topScores(n);
      const mine = rows.findIndex((r) => r.uid === this.user.uid);
      let myRank = mine >= 0 ? mine + 1 : null;
      const best = num(this.scoreManager.bestScore);
      if (myRank === null && best > 0) myRank = await this.backend.rankOf(best);
      return { ok: true, rows, myRank, myUid: this.user.uid };
    } catch (e) {
      return { ok: false, message: humanizeError(e) };
    }
  }
}
