import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION } from '../../../config/firebase.config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

/**
 * Firebase(Auth + Firestore) 백엔드.
 * SDK 는 필요할 때만 CDN 에서 불러온다 (설정이 비어 있으면 아예 불러오지 않음).
 *
 * 백엔드 인터페이스 (MemoryBackend 와 동일):
 *   init(), onAuth(cb), signUp(email, pw), signIn(email, pw), signOut(), resetPassword(email),
 *   getUser(uid), setUser(uid, data), setLeaderboard(uid, data), topScores(n), rankOf(score)
 */
export class FirebaseBackend {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.fa = null;   // firebase/auth 모듈
    this.fs = null;   // firebase/firestore 모듈
  }

  async init() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]);
    this.fa = authMod;
    this.fs = fsMod;
    this.app = appMod.initializeApp(FIREBASE_CONFIG);
    this.auth = authMod.getAuth(this.app);
    this.db = fsMod.getFirestore(this.app);
    try { await authMod.setPersistence(this.auth, authMod.browserLocalPersistence); } catch (e) { /* 기본값 사용 */ }
  }

  /** 로그인 상태 변화 구독. cb({uid,email}|null). 첫 호출은 저장된 로그인 복구 결과. */
  onAuth(cb) {
    return this.fa.onAuthStateChanged(this.auth, (u) => cb(u ? { uid: u.uid, email: u.email || '' } : null));
  }

  async signUp(email, pw) {
    const c = await this.fa.createUserWithEmailAndPassword(this.auth, email, pw);
    return { uid: c.user.uid, email: c.user.email || email };
  }

  async signIn(email, pw) {
    const c = await this.fa.signInWithEmailAndPassword(this.auth, email, pw);
    return { uid: c.user.uid, email: c.user.email || email };
  }

  signOut() { return this.fa.signOut(this.auth); }

  resetPassword(email) { return this.fa.sendPasswordResetEmail(this.auth, email); }

  async getUser(uid) {
    const snap = await this.fs.getDoc(this.fs.doc(this.db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  }

  setUser(uid, data) {
    return this.fs.setDoc(
      this.fs.doc(this.db, 'users', uid),
      { ...data, updatedAt: this.fs.serverTimestamp() },
      { merge: true },
    );
  }

  setLeaderboard(uid, data) {
    return this.fs.setDoc(
      this.fs.doc(this.db, 'leaderboard', uid),
      { ...data, updatedAt: this.fs.serverTimestamp() },
      { merge: true },
    );
  }

  async topScores(n = 30) {
    const { collection, query, orderBy, limit, getDocs } = this.fs;
    const q = query(collection(this.db, 'leaderboard'), orderBy('bestScore', 'desc'), limit(n));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  }

  /** 이 점수보다 높은 사람 수 + 1 */
  async rankOf(score) {
    const { collection, query, where, getCountFromServer } = this.fs;
    const q = query(collection(this.db, 'leaderboard'), where('bestScore', '>', score));
    const snap = await getCountFromServer(q);
    return snap.data().count + 1;
  }
}
