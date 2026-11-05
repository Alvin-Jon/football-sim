import type {
  FormationFluidity,
  FormationSlot,
} from "../types/formation.types.js";
import type { MatchPhase, Vector2D } from "../types/pitch.types.js";
import type { PlayingDirection } from "../types/match.types.js";

import { PitchService } from "./pitch.service.js";

type PlayerLine = "DEFENCE" | "MIDFIELD" | "ATTACK";

export interface FormationShape {
  /** Where this player should be right now, in match coordinates. */
  shapePosition: Vector2D;
  /** How far from shapePosition the player may wander. */
  roamRadius: number;
}

/**
 * Works out where a player should stand to keep the team's formation shape:
 * the slot anchor for the current phase, shifted part of the way toward the
 * ball so the whole team slides with play, then limited by a per-line roam
 * radius.
 *
 * Slot anchors are stored in the left-to-right frame, so positions are mirrored
 * into that frame for the calculation and mirrored back afterwards.
 */
export class FormationPositioningService {
  // How much of the ball offset each line follows (0 = ignores the ball).
  private static readonly BALL_PULL = {
    DEFENCE: { x: 0.3, y: 0.25 },
    MIDFIELD: { x: 0.35, y: 0.3 },
    ATTACK: { x: 0.3, y: 0.2 },
  } as const;

  // Hard limit on how far the ball can drag a player from their anchor.
  private static readonly MAX_SHIFT = { x: 18, y: 14 };

  // Roam radius around the shape position, in metres.
  private static readonly ROAM_RADIUS = {
    DEFENCE: 14,
    MIDFIELD: 20,
    ATTACK: 22,
  } as const;

  private static readonly FLUIDITY_ROAM: Record<string, number> = {
    RIGID: 0.8,
    FLUID: 1.2,
  };

  static getShape(
    slot: FormationSlot,
    phase: MatchPhase,
    ballPosition: Vector2D,
    direction: PlayingDirection,
    fluidity: FormationFluidity,
  ): FormationShape {
    const line = this.getLine(slot);
    const anchor = this.getAnchor(slot, phase);

    // Work in the slot's left-to-right frame.
    const ball = PitchService.transformPosition(ballPosition, direction);
    const pull = this.BALL_PULL[line];

    const shiftX = this.clamp(
      (ball.x - anchor.x) * pull.x,
      -this.MAX_SHIFT.x,
      this.MAX_SHIFT.x,
    );
    const shiftY = this.clamp(
      (ball.y - anchor.y) * pull.y,
      -this.MAX_SHIFT.y,
      this.MAX_SHIFT.y,
    );

    const local = PitchService.clampPosition({
      x: anchor.x + shiftX,
      y: anchor.y + shiftY,
    });

    return {
      shapePosition: PitchService.transformPosition(local, direction),
      roamRadius:
        this.ROAM_RADIUS[line] *
        (this.FLUIDITY_ROAM[fluidity as string] ?? 1),
    };
  }

  private static getAnchor(slot: FormationSlot, phase: MatchPhase): Vector2D {
    if (phase === "ATTACKING") return slot.attackingPosition;
    if (phase === "DEFENDING") return slot.defensivePosition;

    // Transition: halfway between the two shapes.
    return {
      x: (slot.attackingPosition.x + slot.defensivePosition.x) / 2,
      y: (slot.attackingPosition.y + slot.defensivePosition.y) / 2,
    };
  }

  // Classified from the position name, e.g. CB, LB, DM, RW, LST, SRW.
  private static getLine(slot: FormationSlot): PlayerLine {
    const position = String(slot.position).toUpperCase();

    if (/(CB|LB|RB|WB|FB|SW)/.test(position)) return "DEFENCE";
    if (/(ST|CF|FW|LW|RW|WF)/.test(position)) return "ATTACK";

    return "MIDFIELD";
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}