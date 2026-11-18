import { AUDIO_CONFIG } from '../../config/audio.config.js';

/**
 * 오디오 관리자 모듈 (AudioManager)
 * BGM 및 효과음 재생, 볼륨/음소거 제어, 브라우저 Autoplay 정책 대응,
 * LocalStorage 설정 동기화 및 오디오 파일 누락 시 Web Audio API 합성 폴백을 제공합니다.
 */
export class AudioManager {
  /**
   * @param {Object} config 전역 오디오 설정 (AUDIO_CONFIG)
   */
  constructor(config = AUDIO_CONFIG) {
    this.config = config;
    this.storageKey = config.STORAGE_KEY || 'GOGUN_RUN_AUDIO_SETTINGS';

    // 1. 설정값 초기화 (LocalStorage 우선, 없으면 기본값)
    const defaults = config.DEFAULT_SETTINGS || { bgmVolume: 0.5, sfxVolume: 0.7, isMuted: false };
    const saved = this._loadSettings();

    this.bgmVolume = saved.bgmVolume !== undefined ? saved.bgmVolume : defaults.bgmVolume;
    this.sfxVolume = saved.sfxVolume !== undefined ? saved.sfxVolume : defaults.sfxVolume;
    this.isMuted = saved.isMuted !== undefined ? saved.isMuted : defaults.isMuted;

    // 2. Web Audio Context (폴백 합성 및 정밀 제어용)
    this.audioCtx = null;
    this.isAudioUnlocked = false;

    // 3. BGM 오디오 엘리먼트 및 상태
    this.bgmElement = null;
    this.currentBgmKey = null;
    this.isBgmPlaying = false;

    // 4. SFX 오디오 캐시 및 폴백 플래그
    this.sfxElements = new Map();
    this.sfxFailed = new Set();

    // 5. 초기화 및 사용자 제스처 이벤트 등록
    this._initWebAudio();
    this._initBgm();
    this._preloadSfx();
    this._setupAutoplayUnlock();
  }

  /**
   * Web Audio API Context 초기화
   */
  _initWebAudio() {
    try {
      if (typeof window !== 'undefined') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
    } catch (err) {
      console.warn('[AudioManager] Web Audio API를 지원하지 않는 환경입니다.', err);
    }
  }

  /**
   * 브라우저 자동 재생 정책(Autoplay Policy) 해제를 위한 이벤트 핸들러
   */
  _setupAutoplayUnlock() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    const unlockHandler = () => {
      this.unlockAudio();
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };

    window.addEventListener('pointerdown', unlockHandler, { once: true, passive: true });
    window.addEventListener('keydown', unlockHandler, { once: true, passive: true });
    window.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
  }

  /**
   * 오디오 컨텍스트 및 오디오 엘리먼트 잠금 해제
   */
  unlockAudio() {
    if (this.isAudioUnlocked) return;
    this.isAudioUnlocked = true;

    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }

    // 일시정지 상태였던 BGM이 있으면 재개
    if (this.bgmElement && this.isBgmPlaying) {
      this.bgmElement.play().catch(() => {});
    }
  }

  /**
   * BGM 오디오 인스턴스 초기화
   */
  _initBgm() {
    if (typeof Audio === 'undefined') return;

    const bgmConf = this.config.BGM?.MAIN;
    if (!bgmConf || !bgmConf.SRC) return;

    try {
      this.bgmElement = new Audio();
      this.bgmElement.src = bgmConf.SRC;
      this.bgmElement.loop = bgmConf.LOOP ?? true;
      this._updateBgmVolume();

      this.bgmElement.addEventListener('error', (e) => {
        console.warn(`[AudioManager] BGM 로드 실패 (${bgmConf.SRC}), 파일이 누락되었거나 접근할 수 없습니다.`, e);
      });
    } catch (err) {
      console.warn('[AudioManager] BGM 초기화 실패:', err);
    }
  }

  /**
   * SFX 오디오 사전 로드
   */
  _preloadSfx() {
    if (typeof Audio === 'undefined') return;

    const sfxList = this.config.SFX || {};
    for (const [key, conf] of Object.entries(sfxList)) {
      if (!conf.SRC) continue;
      try {
        const audio = new Audio();
        audio.src = conf.SRC;
        audio.preload = 'auto';

        audio.addEventListener('error', () => {
          // 파일이 없거나 로드 실패 시 폴백 합성 모드로 전환
          this.sfxFailed.add(key);
        });

        this.sfxElements.set(key, audio);
      } catch (err) {
        this.sfxFailed.add(key);
      }
    }
  }

  /**
   * BGM 재생
   * @param {string} bgmKey
   */
  playBgm(bgmKey = 'MAIN') {
    this.currentBgmKey = bgmKey;
    this.isBgmPlaying = true;

    if (!this.bgmElement) {
      this._initBgm();
    }

    if (this.bgmElement) {
      this._updateBgmVolume();
      const promise = this.bgmElement.play();
      if (promise !== undefined) {
        promise.catch(() => {
          // 브라우저 정책으로 재생 차단 시 첫 인터랙션 시 자동 해제되도록 대기
        });
      }
    }
  }

  /**
   * BGM 일시정지
   */
  pauseBgm() {
    this.isBgmPlaying = false;
    if (this.bgmElement) {
      this.bgmElement.pause();
    }
  }

  /**
   * BGM 재개
   */
  resumeBgm() {
    if (this.bgmElement && this.currentBgmKey) {
      this.isBgmPlaying = true;
      this._updateBgmVolume();
      const promise = this.bgmElement.play();
      if (promise !== undefined) {
        promise.catch(() => {});
      }
    }
  }

  /**
   * BGM 완전 정지 및 재생 위치 리셋
   */
  stopBgm() {
    this.isBgmPlaying = false;
    if (this.bgmElement) {
      this.bgmElement.pause();
      this.bgmElement.currentTime = 0;
    }
  }

  /**
   * 효과음 재생 (동일 사운드 연속 재생 및 파일 누락 시 Web Audio API 합성 폴백 지원)
   * @param {'JUMP' | 'LAND' | 'HIT' | 'GAME_OVER' | 'BUTTON_CLICK' | 'NEAR_MISS'} sfxKey
   * @param {{ combo?: number, perfect?: boolean }} [options] 합성음 변주용 옵션 (NEAR_MISS: 콤보가 높을수록 높은 음)
   */
  playSfx(sfxKey, options = {}) {
    if (this.isMuted || this.sfxVolume <= 0) {
      return;
    }

    // 파일 로드 실패 또는 누락된 경우 Web Audio API 합성 사운드 출력
    if (this.sfxFailed.has(sfxKey)) {
      this._playSynthesizedSfx(sfxKey, options);
      return;
    }

    const sfxConf = this.config.SFX?.[sfxKey];
    const baseAudio = this.sfxElements.get(sfxKey);

    if (baseAudio && baseAudio.src) {
      try {
        // 다중 발사를 위한 오디오 복제본 생성
        const sound = baseAudio.cloneNode();
        const factor = sfxConf?.VOLUME_FACTOR ?? 1.0;
        sound.volume = Math.max(0, Math.min(1, this.sfxVolume * factor));

        const promise = sound.play();
        if (promise !== undefined) {
          promise.catch(() => {
            // 재생 실패 시 폴백 합성 시도
            this._playSynthesizedSfx(sfxKey, options);
          });
        }
      } catch (err) {
        this._playSynthesizedSfx(sfxKey, options);
      }
    } else {
      this._playSynthesizedSfx(sfxKey, options);
    }
  }

  /**
   * 오디오 파일이 누락되었을 때의 8비트/레트로 감성 Web Audio API 실시간 합성 사운드
   * @param {string} sfxKey
   * @param {{ combo?: number, perfect?: boolean }} [options]
   */
  _playSynthesizedSfx(sfxKey, options = {}) {
    if (!this.audioCtx || this.isMuted || this.sfxVolume <= 0) return;

    if (this.audioCtx.state === 'suspended' && this.isAudioUnlocked) {
      this.audioCtx.resume().catch(() => {});
    }

    try {
      const now = this.audioCtx.currentTime;
      const masterGain = this.audioCtx.createGain();
      const factor = this.config.SFX?.[sfxKey]?.VOLUME_FACTOR ?? 0.8;
      masterGain.gain.setValueAtTime(this.sfxVolume * factor * 0.35, now);
      masterGain.connect(this.audioCtx.destination);

      switch (sfxKey) {
        case 'JUMP': {
          // 상승 피치 스윕 (180Hz -> 600Hz)
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(180, now);
          osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);

          gain.gain.setValueAtTime(1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }

        case 'LAND': {
          // 저주파 쿵 (130Hz -> 45Hz)
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(130, now);
          osc.frequency.exponentialRampToValueAtTime(45, now + 0.1);

          gain.gain.setValueAtTime(1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.1);
          break;
        }

        case 'HIT': {
          // 충돌 노이즈 버스트
          const bufferSize = this.audioCtx.sampleRate * 0.2;
          const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
          }
          const noise = this.audioCtx.createBufferSource();
          noise.buffer = buffer;
          noise.connect(masterGain);
          noise.start(now);
          break;
        }

        case 'GAME_OVER': {
          // 하강 멜로디 (220 -> 174 -> 146 -> 116)
          const freqs = [220, 174, 146, 116];
          freqs.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const t = now + idx * 0.2;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.8, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.2);
          });
          break;
        }

        case 'BUTTON_CLICK': {
          // 깔끔한 UI 클릭 짹소리 (900Hz -> 1300Hz)
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(900, now);
          osc.frequency.exponentialRampToValueAtTime(1300, now + 0.04);

          gain.gain.setValueAtTime(0.8, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        }

        case 'HOOK_CONNECT': {
          // 금속 와이어 걸림 핑 소리 (1200Hz -> 1600Hz)
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(1200, now);
          osc.frequency.exponentialRampToValueAtTime(1600, now + 0.1);

          gain.gain.setValueAtTime(1, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case 'HOOK_RELEASE': {
          // 갈고리 해제 후 튕겨나가는 휘익 소리 (350Hz -> 850Hz)
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(350, now);
          osc.frequency.exponentialRampToValueAtTime(850, now + 0.16);

          gain.gain.setValueAtTime(0.9, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);

          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.16);
          break;
        }

        case 'COIN': {
          // 짧고 밝은 두 음 (연속으로 먹을수록 음정이 올라감)
          const step = Math.min(options.chain ?? 0, 7);
          const root = 988 * Math.pow(2, (step * 2) / 12);
          [root, root * 1.5].forEach((f, k) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, now + k * 0.05);
            gain.gain.setValueAtTime(0.0001, now + k * 0.05);
            gain.gain.exponentialRampToValueAtTime(0.6, now + k * 0.05 + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.01, now + k * 0.05 + 0.1);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now + k * 0.05);
            osc.stop(now + k * 0.05 + 0.11);
          });
          break;
        }

        case 'NEAR_MISS': {
          // 니어미스 "띠링": 콤보가 쌓일수록 음이 한 음씩 올라감 (최대 8단계), 퍼펙트는 3음
          const step = Math.min(Math.max((options.combo || 1) - 1, 0), 8);
          const root = 740 * Math.pow(2, (step * 2) / 12);
          const notes = options.perfect ? [root, root * 1.25, root * 1.5] : [root, root * 1.5];
          notes.forEach((freq, idx) => {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            const t = now + idx * 0.055;
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, t);

            gain.gain.setValueAtTime(0.9, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.11);
          });
          break;
        }
      }
    } catch (err) {
      // 오디오 합성 에러 무시 (게임 흐름 방해 방지)
    }
  }

  /**
   * BGM 볼륨 갱신 (음소거 및 설정값 반영)
   */
  _updateBgmVolume() {
    if (!this.bgmElement) return;
    const factor = this.config.BGM?.MAIN?.VOLUME_FACTOR ?? 0.6;
    const targetVolume = this.isMuted ? 0 : this.bgmVolume * factor;
    this.bgmElement.volume = Math.max(0, Math.min(1, targetVolume));
  }

  /**
   * BGM 음량 설정 (0.0 ~ 1.0)
   * @param {number} value
   */
  setBgmVolume(value) {
    this.bgmVolume = Math.max(0, Math.min(1, Number(value)));
    this._updateBgmVolume();
    this._saveSettings();
  }

  /**
   * 효과음 음량 설정 (0.0 ~ 1.0)
   * @param {number} value
   */
  setSfxVolume(value) {
    this.sfxVolume = Math.max(0, Math.min(1, Number(value)));
    this._saveSettings();
  }

  /**
   * 전체 음소거 설정
   * @param {boolean} isMuted
   */
  setMuted(isMuted) {
    this.isMuted = Boolean(isMuted);
    this._updateBgmVolume();
    this._saveSettings();
  }

  /**
   * 전체 음소거 토글
   * @returns {boolean} 토글된 음소거 상태
   */
  toggleMute() {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * LocalStorage로부터 오디오 설정 불러오기
   * @returns {Object}
   */
  _loadSettings() {
    if (typeof localStorage === 'undefined') return {};
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        return {
          bgmVolume: typeof parsed.bgmVolume === 'number' ? parsed.bgmVolume : undefined,
          sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : undefined,
          isMuted: typeof parsed.isMuted === 'boolean' ? parsed.isMuted : undefined,
        };
      }
    } catch (err) {
      console.warn('[AudioManager] LocalStorage 오디오 설정 불러오기 실패, 기본값 사용:', err);
    }
    return {};
  }

  /**
   * LocalStorage에 오디오 설정 저장
   */
  _saveSettings() {
    if (typeof localStorage === 'undefined') return;
    try {
      const payload = JSON.stringify({
        bgmVolume: this.bgmVolume,
        sfxVolume: this.sfxVolume,
        isMuted: this.isMuted,
      });
      localStorage.setItem(this.storageKey, payload);
    } catch (err) {
      console.warn('[AudioManager] LocalStorage 오디오 설정 저장 실패:', err);
    }
  }

  /**
   * 자원 해제 (STEP 6 메모리 누수 방지)
   */
  destroy() {
    this.stopBgm();
    if (this.bgmElement) {
      this.bgmElement.pause();
      this.bgmElement.src = '';
      this.bgmElement = null;
    }
    if (this.sfxElements.size > 0) {
      for (const audio of this.sfxElements.values()) {
        audio.pause();
        audio.src = '';
      }
      this.sfxElements.clear();
    }
    this.sfxFailed.clear();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
  }
}
