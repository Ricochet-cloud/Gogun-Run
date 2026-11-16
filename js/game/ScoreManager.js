/**
 * 점수 및 최고 기록 관리자 (ScoreManager)
 * 실시간 진행 거리 기반 점수 산출, LocalStorage 기반 최고 기록 저장/불러오기,
 * 신기록 달성 판정 및 예외 처리를 담당합니다.
 */

export class ScoreManager {
  /**
   * @param {Object} config 전역 게임 설정 (GAME_CONFIG)
   */
  constructor(config) {
    this.scoreConfig = config.SCORE || {};
    this.pointsPerPixel = this.scoreConfig.POINTS_PER_PIXEL || 0.1;
    this.storageKey = this.scoreConfig.STORAGE_KEY || 'GOGUN_RUN_HIGH_SCORE';

    this.distance = 0;
    this.elapsedTime = 0;
    this.score = 0;

    // 최고 기록 및 신기록 달성 여부
    this.highScore = this._loadHighScore();
    this.isNewRecord = false;
  }

  /**
   * 실시간 점수 업데이트
   * @param {number} dt 경과 시간 (seconds)
   * @param {number} currentSpeed 현재 게임 속도 (px/s)
   */
  update(dt, currentSpeed) {
    this.elapsedTime += dt;
    this.distance += currentSpeed * dt;
    this.score = Math.floor(this.distance * this.pointsPerPixel);
  }

  /**
   * 현재 점수 반환 (정수)
   * @returns {number}
   */
  get currentScore() {
    return this.score;
  }

  /**
   * 최고 기록 반환 (정수)
   * @returns {number}
   */
  get bestScore() {
    return this.highScore;
  }

  /**
   * 신기록 달성 여부 반환
   * @returns {boolean}
   */
  get hasNewRecord() {
    return this.isNewRecord;
  }

  /**
   * 게임 오버 시 점수 확정 및 최고 기록 갱신 검사
   * @returns {boolean} 신기록 달성 여부
   */
  finalizeScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
      this._saveHighScore(this.highScore);
      return true;
    }
    this.isNewRecord = false;
    return false;
  }

  /**
   * 점수 및 진행 정보 초기화 (재시작 시)
   */
  reset() {
    this.distance = 0;
    this.elapsedTime = 0;
    this.score = 0;
    this.isNewRecord = false;
  }

  /**
   * 점수 포맷팅 유틸리티 (6자리 고정 문자열: 예: "001230")
   * @param {number} val
   * @returns {string}
   */
  formatScore(val = this.score) {
    const intVal = Math.max(0, Math.floor(Number(val) || 0));
    return String(intVal).padStart(6, '0');
  }

  /**
   * LocalStorage로부터 최고 기록 안전하게 불러오기
   * @returns {number}
   */
  _loadHighScore() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[ScoreManager] LocalStorage 접근 실패, 메모리 기본값(0)을 사용합니다.', err);
    }
    return 0;
  }

  /**
   * LocalStorage에 최고 기록 안전하게 저장
   * @param {number} score
   */
  _saveHighScore(score) {
    try {
      localStorage.setItem(this.storageKey, String(Math.floor(score)));
    } catch (err) {
      console.warn('[ScoreManager] LocalStorage 저장 실패:', err);
    }
  }
}
