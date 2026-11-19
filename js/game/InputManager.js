/**
 * 사용자 입력 관리자 (키보드, 마우스, 모바일 터치)
 * 점프, 갈고리(Hook), 일시정지(P/Escape) 입력을 처리하고 UI 버튼 상호작용 충돌을 방지합니다.
 */

export class InputManager {
  /**
   * @param {HTMLElement} targetElement 마우스/터치 이벤트를 수신할 엘리먼트 (보통 Canvas 또는 GameContainer)
   * @param {Object|null} keysConfig 커스텀 키 설정
   */
  constructor(targetElement, keysConfig = null) {
    this.targetElement = targetElement;
    this.keysConfig = keysConfig || {
      JUMP: ['Space', 'ArrowUp'],
      HOOK: ['KeyZ', 'KeyJ', 'ShiftLeft', 'ShiftRight'],
      PAUSE: ['KeyP', 'Escape'],
    };

    this.enabled = true;

    this._actionListeners = {
      jump: new Set(),
      hook: new Set(),
      pause: new Set(),
    };

    // 키보드 중복 입력 방지 (키 눌림 상태 추적)
    this._pressedKeys = new Set();

    // 마우스 버튼 중복 입력 방지 (버튼 눌림 상태 추적)
    this._pressedButtons = new Set();

    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);

    this._init();
  }

  /**
   * 이벤트 리스너 등록
   */
  _init() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    if (this.targetElement) {
      this.targetElement.addEventListener('pointerdown', this._onPointerDown);
      this.targetElement.addEventListener('pointerup', this._onPointerUp);
      this.targetElement.addEventListener('contextmenu', this._onContextMenu);
    }
  }

  /**
   * 마우스 우클릭 기본 메뉴 팝업 방지 (우클릭을 갈고리 조작으로 활용)
   * @param {MouseEvent} e
   */
  _handleContextMenu(e) {
    e.preventDefault();
  }

  /**
   * 키보드 입력 핸들러 (중복 입력 방지)
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // 입력 폼/슬라이더 조작 중일 때는 게임 조작 입력 무시
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'BUTTON')) {
      return;
    }

    // 이미 눌려있는 키는 중복 처리
    if (this._pressedKeys.has(e.code)) {
      return;
    }
    this._pressedKeys.add(e.code);

    const jumpKeys = this.keysConfig.JUMP || ['Space', 'ArrowUp'];
    const hookKeys = this.keysConfig.HOOK || ['KeyZ', 'KeyJ', 'ShiftLeft', 'ShiftRight'];
    const pauseKeys = this.keysConfig.PAUSE || ['KeyP', 'Escape'];

    // 1. 일시정지 키 (항상 수신 가능)
    if (pauseKeys.includes(e.code)) {
      e.preventDefault();
      this._emit('pause');
      return;
    }

    // 입력 비활성화 상태인 경우 게임 액션 차단 (일시정지 중 조작 방지)
    if (!this.enabled) {
      return;
    }

    // 2. 점프 키
    if (jumpKeys.includes(e.code)) {
      e.preventDefault();
      this._emit('jump');
      return;
    }

    // 3. 갈고리 액션 키
    if (hookKeys.includes(e.code)) {
      e.preventDefault();
      this._emit('hook');
      return;
    }
  }

  /**
   * 키보드 입력 해제 핸들러
   * @param {KeyboardEvent} e
   */
  _handleKeyUp(e) {
    this._pressedKeys.delete(e.code);
  }

  /**
   * 마우스 클릭 및 터치 입력 핸들러 (중복 입력 방지)
   * @param {PointerEvent} e
   */
  _handlePointerDown(e) {
    if (!this.enabled) return;

    // UI 상호작용 요소(버튼, 슬라이더 등) 클릭 시에는 게임 조작 트리거 제외
    if (e.target && typeof e.target.closest === 'function') {
      const isUiInteractive = e.target.closest('button, input, [data-interactive="true"], .ui-interactive');
      if (isUiInteractive) {
        return;
      }
    }

    // 모바일 터치 시 페이지 확대/스크롤 방지
    if (e.pointerType === 'touch' && e.cancelable) {
      e.preventDefault();
    }

    // 같은 버튼의 중복 눌림 방지
    if (this._pressedButtons.has(e.button)) {
      return;
    }
    this._pressedButtons.add(e.button);

    // 마우스 우클릭 (button === 2)은 갈고리 조작으로 매핑
    if (e.button === 2) {
      e.preventDefault();
      this._emit('hook');
      return;
    }

    // 일반 좌클릭 및 화면 터치는 점프로 처리 (source='pointer': 메인 화면에서는 게임 시작으로 쓰지 않음)
    this._emit('jump', 'pointer');
  }

  /**
   * 포인터 입력 해제 핸들러
   * @param {PointerEvent} e
   */
  _handlePointerUp(e) {
    this._pressedButtons.delete(e.button);
  }

  /**
   * 조작 활성화 여부 설정 (일시정지 및 모달 등에서 제어)
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  /**
   * 특정 액션에 대한 리스너 등록
   * @param {'jump' | 'hook' | 'pause'} action
   * @param {Function} callback
   * @returns {Function} 리스너 해제 함수
   */
  on(action, callback) {
    if (this._actionListeners[action]) {
      this._actionListeners[action].add(callback);
    }
    return () => {
      if (this._actionListeners[action]) {
        this._actionListeners[action].delete(callback);
      }
    };
  }

  /**
   * 수동 액션 방출 (가상 모바일 버튼 등에서 호출)
   * @param {'jump' | 'hook' | 'pause'} action
   */
  emit(action) {
    this._emit(action);
  }

  /**
   * 액션 실행
   * @param {string} action
   */
  _emit(action, source) {
    const listeners = this._actionListeners[action];
    if (listeners) {
      for (const listener of listeners) {
        listener(source);
      }
    }
  }

  /**
   * 이벤트 리스너 정리
   */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    if (this.targetElement) {
      this.targetElement.removeEventListener('pointerdown', this._onPointerDown);
      this.targetElement.removeEventListener('pointerup', this._onPointerUp);
      this.targetElement.removeEventListener('contextmenu', this._onContextMenu);
    }
    this._actionListeners.jump.clear();
    this._actionListeners.hook.clear();
    this._actionListeners.pause.clear();
    this._pressedKeys.clear();
    this._pressedButtons.clear();
  }
}
