/**
 * 오디오 시스템 전역 설정 파일
 * BGM 및 효과음 파일 경로, 기본 볼륨, 저장소 키를 관리합니다.
 * 오디오 파일 교체 시 이 파일의 경로(SRC)를 수정하거나 해당 경로의 파일을 교체하면 적용됩니다.
 */

export const AUDIO_CONFIG = Object.freeze({
  // LocalStorage 저장 키
  STORAGE_KEY: 'GOGUN_RUN_AUDIO_SETTINGS',

  // 기본 볼륨 및 음소거 설정
  DEFAULT_SETTINGS: {
    bgmVolume: 0.5,     // BGM 기본 볼륨 (0.0 ~ 1.0)
    sfxVolume: 0.7,     // 효과음 기본 볼륨 (0.0 ~ 1.0)
    isMuted: false,     // 전체 음소거 여부
  },

  // 배경 음악 (BGM) 설정
  BGM: {
    MAIN: {
      SRC: 'assets/audio/bgm_main.wav',
      LOOP: true,
      VOLUME_FACTOR: 0.55, // 마스터 대비 상대 볼륨 비율
    },
  },

  // 효과음 (SFX) 설정
  SFX: {
    JUMP: {
      SRC: 'assets/audio/sfx_jump.wav',
      VOLUME_FACTOR: 0.8,
    },
    LAND: {
      SRC: 'assets/audio/sfx_land.wav',
      VOLUME_FACTOR: 0.65,
    },
    HIT: {
      SRC: 'assets/audio/sfx_hit.wav',
      VOLUME_FACTOR: 0.9,
    },
    GAME_OVER: {
      SRC: 'assets/audio/sfx_game_over.wav',
      VOLUME_FACTOR: 0.85,
    },
    BUTTON_CLICK: {
      SRC: 'assets/audio/sfx_click.wav',
      VOLUME_FACTOR: 0.55,
    },
    HOOK_CONNECT: {
      SRC: 'assets/audio/sfx_hook_connect.wav',
      VOLUME_FACTOR: 0.75,
    },
    HOOK_RELEASE: {
      SRC: 'assets/audio/sfx_hook_release.wav',
      VOLUME_FACTOR: 0.75,
    },
  },
});
