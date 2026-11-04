import type { Vector2D } from "../types/pitch.types.js";

export type AttackingDirection =
  | "LEFT_TO_RIGHT"
  | "RIGHT_TO_LEFT";

export class DecisionPositionService {
  getAttackSign(
    direction: AttackingDirection,
  ): 1 | -1 {
    return direction === "LEFT_TO_RIGHT" ? 1 : -1;
  }

  getForwardPosition(
    position: Vector2D,
    distance: number,
    direction: AttackingDirection,
  ): Vector2D {
    return {
      x: position.x + distance * this.getAttackSign(direction),
      y: position.y,
    };
  }

  getForwardDistance(
    from: Vector2D,
    to: Vector2D,
    direction: AttackingDirection,
  ): number {
    return (to.x - from.x) * this.getAttackSign(direction);
  }

  isAhead(
    from: Vector2D,
    to: Vector2D,
    direction: AttackingDirection,
  ): boolean {
    return this.getForwardDistance(from, to, direction) > 0;
  }
}