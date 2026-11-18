/**
 * 프로필 관리자 (ProfileManager)
 * 닉네임과 누적 통계를 localStorage 에 저장한다.
 * 나중에 로그인/친구 경쟁 기능을 붙일 때 이 데이터(state)를 통째로 서버에 올릴 수 있도록
 * 모든 값을 하나의 객체로 모아 둔다. (최고 점수는 ScoreManager, 코인/장착은 ShopManager 가 따로 관리)
 */

export const PROFILE_STORAGE_KEY = 'gogun-run:profile';
export const NICKNAME_MAX = 12;

export class ProfileManager {
  constructor() {
    this.state = this._load();
    this.save();
  }

  _defaultState() {
    return {
      version: 1,
      nickname: `러너${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: Date.now(),
      runs: 0,
      nearMisses: 0,
      coinsEarned: 0,
    };
  }

  _load() {
    const d = this._defaultState();
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || 'null');
      if (!raw || typeof raw !== 'object') return d;
      const nick = ProfileManager.sanitizeNickname(raw.nickname);
      const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
      return {
        version: 1,
        nickname: nick || d.nickname,
        createdAt: Number(raw.createdAt) || d.createdAt,
        runs: n(raw.runs),
        nearMisses: n(raw.nearMisses),
        coinsEarned: n(raw.coinsEarned),
      };
    } catch (e) {
      return d;
    }
  }

  save() {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      // 저장 불가 환경에서는 세션 동안만 유지
    }
  }

  /**
   * 닉네임 정리: 제어/서식 문자 제거, 공백 정리, 최대 길이 제한. 비어 있으면 빈 문자열.
   * @param {unknown} raw
   * @returns {string}
   */
  static sanitizeNickname(raw) {
    const s = String(raw ?? '')
      .normalize('NFC')
      .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')   // 제어 문자, 줄바꿈, 보이지 않는 서식 문자
      .replace(/\s+/g, ' ')
      .trim();
    return [...s].slice(0, NICKNAME_MAX).join('').trim();
  }

  get nickname() { return this.state.nickname; }

  /** @returns {{ok: boolean, value?: string, reason?: string}} */
  setNickname(raw) {
    const v = ProfileManager.sanitizeNickname(raw);
    if (!v) return { ok: false, reason: '닉네임을 입력해 주세요' };
    this.state.nickname = v;
    this.save();
    return { ok: true, value: v };
  }

  /** 한 판이 끝날 때 누적 통계 갱신 */
  recordRun({ nearMisses = 0, coins = 0 } = {}) {
    this.state.runs += 1;
    this.state.nearMisses += Math.max(0, Math.floor(nearMisses));
    this.state.coinsEarned += Math.max(0, Math.floor(coins));
    this.save();
  }
}
