/**
 * 게임 상태 정의 및 상태 관리자
 */

export const GameState = Object.freeze({
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
});

export class GameStateManager {
  /**
   * @param {string} initialState 초기 게임 상태
   */
  constructor(initialState = GameState.PLAYING) {
    this._currentState = initialState;
    this._listeners = new Set();
  }

  /**
   * 현재 게임 상태 반환
   * @returns {string}
   */
  get current() {
    return this._currentState;
  }

  /**
   * 특정 상태인지 확인
   * @param {string} state
   * @returns {boolean}
   */
  is(state) {
    return this._currentState === state;
  }

  /**
   * 게임 상태 변경 및 리스너 호출
   * @param {string} nextState
   */
  setState(nextState) {
    if (!Object.values(GameState).includes(nextState)) {
      console.warn(`[GameStateManager] 유효하지 않은 게임 상태: ${nextState}`);
      return;
    }

    if (this._currentState === nextState) {
      return;
    }

    const prevState = this._currentState;
    this._currentState = nextState;

    for (const listener of this._listeners) {
      listener(nextState, prevState);
    }
  }

  /**
   * 상태 변경 감지 리스너 등록
   * @param {Function} listener
   * @returns {Function} 구독 해제 함수
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
