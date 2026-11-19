/**
 * Firebase 설정
 *
 * Firebase 콘솔 → 프로젝트 설정 → "내 앱" → 웹 앱(</>)의 firebaseConfig 값을 아래에 붙여 넣으세요.
 * (자세한 순서는 docs/FIREBASE_SETUP.md)
 *
 * 참고: 웹 앱의 apiKey 는 비밀번호가 아니라 "프로젝트 식별용 공개 값"이라 저장소에 올려도 됩니다.
 *       실제 보안은 firebase/firestore.rules (보안 규칙)가 담당합니다.
 *
 * 값이 비어 있으면 온라인 기능(로그인/랭킹)이 꺼지고, 게임은 기존처럼 브라우저에만 저장하며 정상 동작합니다.
 */
export const FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/** gstatic CDN 에서 불러올 Firebase SDK 버전 */
export const FIREBASE_SDK_VERSION = '10.14.1';

export function isFirebaseConfigured() {
  return !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}
