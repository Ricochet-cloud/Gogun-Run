/**
 * 테스트/데모용 가짜 백엔드 (브라우저 localStorage 에 저장).
 * 주소에 ?cloud=mock 을 붙이면 Firebase 없이 로그인/랭킹 화면을 시험해 볼 수 있다.
 * 실제 서비스에서는 쓰이지 않는다.
 */
const KEY = 'gogun-run:mock-cloud';

function err(code) { const e = new Error(code); e.code = code; return e; }

export class MemoryBackend {
  constructor() {
    this.cbs = new Set();
    this.db = this._read();
    this.user = null;
    this.offline = false;     // 테스트에서 true 로 바꾸면 네트워크 오류 흉내
  }

  _read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { accounts: {}, users: {}, lb: {}, session: null }; } catch (e) { return { accounts: {}, users: {}, lb: {}, session: null }; }
  }
  _write() { try { localStorage.setItem(KEY, JSON.stringify(this.db)); } catch (e) { /* 무시 */ } }
  _net() { if (this.offline) throw err('unavailable'); }
  _emit() { for (const cb of this.cbs) cb(this.user); }

  async init() {
    if (this.db.session && this.db.accounts[this.db.session]) {
      const a = this.db.accounts[this.db.session];
      this.user = { uid: a.uid, email: a.email };
    }
  }

  onAuth(cb) {
    this.cbs.add(cb);
    setTimeout(() => cb(this.user), 0);
    return () => this.cbs.delete(cb);
  }

  async signUp(email, pw) {
    this._net();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw err('auth/invalid-email');
    if (pw.length < 6) throw err('auth/weak-password');
    if (this.db.accounts[email]) throw err('auth/email-already-in-use');
    const uid = 'u' + Math.random().toString(36).slice(2, 10);
    this.db.accounts[email] = { uid, email, pw };
    this.db.session = email;
    this._write();
    this.user = { uid, email };
    this._emit();
    return this.user;
  }

  async signIn(email, pw) {
    this._net();
    const a = this.db.accounts[email];
    if (!a || a.pw !== pw) throw err('auth/invalid-credential');
    this.db.session = email;
    this._write();
    this.user = { uid: a.uid, email };
    this._emit();
    return this.user;
  }

  async signOut() {
    this.db.session = null;
    this._write();
    this.user = null;
    this._emit();
  }

  async resetPassword(email) {
    this._net();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw err('auth/invalid-email');
  }

  async getUser(uid) { this._net(); this.db = this._read(); return this.db.users[uid] ? { ...this.db.users[uid] } : null; }

  async setUser(uid, data) {
    this._net();
    this.db = this._read();
    const prev = this.db.users[uid] || {};
    if (prev.bestScore > data.bestScore) throw err('permission-denied');
    this.db.users[uid] = { ...prev, ...data };
    this._write();
  }

  async setLeaderboard(uid, data) {
    this._net();
    this.db = this._read();
    const prev = this.db.lb[uid] || {};
    if (prev.bestScore > data.bestScore) throw err('permission-denied');
    this.db.lb[uid] = { ...prev, ...data };
    this._write();
  }

  async topScores(n = 30) {
    this._net();
    this.db = this._read();
    return Object.entries(this.db.lb)
      .map(([uid, v]) => ({ uid, ...v }))
      .sort((a, b) => b.bestScore - a.bestScore)
      .slice(0, n);
  }

  async rankOf(score) {
    this._net();
    this.db = this._read();
    return Object.values(this.db.lb).filter((v) => v.bestScore > score).length + 1;
  }
}
