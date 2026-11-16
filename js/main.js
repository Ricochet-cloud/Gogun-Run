import { Game } from './game/Game.js';

/**
 * 게임 부트스트랩
 */
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) {
    console.error('[Main] #game-canvas 요소를 찾을 수 없습니다.');
    return;
  }

  const game = new Game(canvas);
  await game.init();
  game.start();

  // 디버그 및 검증을 위해 window 객체에 바인딩
  window.__GAME_INSTANCE__ = game;
});
