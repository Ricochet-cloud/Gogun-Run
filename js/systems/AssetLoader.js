/**
 * 비동기 이미지 에셋 로더
 * 이미지 로딩 상태 관리, 캐싱, 에러 처리 및 폴백 연동을 지원합니다.
 */

export class AssetLoader {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} */
    this._images = new Map();

    /** @type {Map<string, 'loading' | 'loaded' | 'error'>} */
    this._status = new Map();

    /** @type {Map<string, Promise<HTMLImageElement | null>>} */
    this._loadingPromises = new Map();
  }

  /**
   * 단일 이미지 비동기 로드 (중복 로딩 방지 캐싱)
   * @param {string} key 에셋 식별자
   * @param {string} src 이미지 파일 경로 또는 Data URL
   * @returns {Promise<HTMLImageElement | null>}
   */
  loadImage(key, src) {
    // 1. 이미 캐시된 경우 즉시 반환
    if (this._images.has(key) && this._status.get(key) === 'loaded') {
      return Promise.resolve(this._images.get(key));
    }

    // 2. 이미 로딩 진행 중인 프로미스가 있는 경우 재사용
    if (this._loadingPromises.has(key)) {
      return this._loadingPromises.get(key);
    }

    const promise = new Promise((resolve) => {
      const img = new Image();
      this._status.set(key, 'loading');

      img.onload = () => {
        this._images.set(key, img);
        this._status.set(key, 'loaded');
        this._loadingPromises.delete(key);
        resolve(img);
      };

      img.onerror = (error) => {
        console.warn(
          `[AssetLoader] 에셋 로드 실패 (key: "${key}", src: "${src}"). 안전한 폴백 렌더링으로 전환됩니다.`,
          error
        );
        this._status.set(key, 'error');
        this._loadingPromises.delete(key);
        // 에러 시 전체 흐름이 중단되지 않도록 null로 정상 resolve
        resolve(null);
      };

      img.src = src;
    });

    this._loadingPromises.set(key, promise);
    return promise;
  }

  /**
   * 여러 에셋 일괄 로드
   * @param {Array<{ key: string, src: string }>} manifest
   * @returns {Promise<void>}
   */
  async loadAll(manifest) {
    if (!manifest || manifest.length === 0) return;
    const promises = manifest.map((item) => this.loadImage(item.key, item.src));
    await Promise.all(promises);
  }

  /**
   * 캐시된 이미지 객체 조회
   * @param {string} key
   * @returns {HTMLImageElement | null}
   */
  getImage(key) {
    if (this.isLoaded(key)) {
      return this._images.get(key) || null;
    }
    return null;
  }

  /**
   * 특정 에셋이 성공적으로 로드되었는지 확인
   * @param {string} key
   * @returns {boolean}
   */
  isLoaded(key) {
    return this._status.get(key) === 'loaded';
  }

  /**
   * 특정 에셋 로드에 실패했는지 확인
   * @param {string} key
   * @returns {boolean}
   */
  hasError(key) {
    return this._status.get(key) === 'error';
  }

  /**
   * 모든 요청된 에셋의 처리가 완료(로드 완료 또는 실패)되었는지 확인
   * @returns {boolean}
   */
  isReady() {
    for (const status of this._status.values()) {
      if (status === 'loading') return false;
    }
    return true;
  }

  /**
   * 캐시 및 상태 전체 초기화
   */
  clear() {
    this._images.clear();
    this._status.clear();
    this._loadingPromises.clear();
  }
}

// 애플리케이션 전역 싱글톤 인스턴스
export const assetLoader = new AssetLoader();
