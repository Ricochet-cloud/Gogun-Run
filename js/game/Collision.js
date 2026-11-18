/**
 * 충돌 판정 모듈
 * AABB(Axis-Aligned Bounding Box) 기반 충돌 검사를 수행합니다.
 */

export class Collision {
  /**
   * 두 사각형(AABB) 간의 겹침 여부 확인
   * @param {{ x: number, y: number, width: number, height: number }} a
   * @param {{ x: number, y: number, width: number, height: number }} b
   * @returns {boolean} 충돌 여부
   */
  static checkAABB(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /**
   * 플레이어와 활성 장애물 목록 간의 충돌 검사
   * 불필요한 연산을 줄이기 위해 플레이어 전후 일정 범위를 벗어난 장애물은 건너뜁니다.
   * @param {Object} player Player 인스턴스
   * @param {Array<Object>} obstacles Obstacle 인스턴스 배열
   * @returns {boolean} 충돌 발생 여부
   */
  static checkPlayerObstacles(player, obstacles) {
    return Collision.findPlayerObstacle(player, obstacles) !== null;
  }

  /**
   * 플레이어와 처음으로 충돌한 장애물 반환 (없으면 null)
   * @param {Object} player Player 인스턴스
   * @param {Array<Object>} obstacles Obstacle 인스턴스 배열
   * @returns {Object|null}
   */
  static findPlayerObstacle(player, obstacles) {
    if (!player || !obstacles || obstacles.length === 0) {
      return null;
    }

    const playerBox = player.getHitbox();

    for (const obstacle of obstacles) {
      // 1. 플레이어보다 훨씬 뒤에 있거나(이미 통과) 멀리 앞에 있는 장애물은 판정 제외
      if (obstacle.x + obstacle.width < playerBox.x - 10) {
        continue;
      }
      if (obstacle.x > playerBox.x + playerBox.width + 40) {
        continue;
      }

      // 2. 히트박스 기반 AABB 검사
      const obsBox = obstacle.getHitbox();
      if (Collision.checkAABB(playerBox, obsBox)) {
        return obstacle;
      }
    }

    return null;
  }
}
