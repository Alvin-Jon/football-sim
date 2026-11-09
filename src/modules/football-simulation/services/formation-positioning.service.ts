import type {
  FormationFluidity,
  FormationSlot,
  FormationPosition,
} from "../types/formation.types.js";

import type { MatchPhase, Vector2D } from "../types/pitch.types.js";
import type { PlayingDirection } from "../types/match.types.js";
import type { TacticalModifiers } from "../types/tactics.types.js";

import { PITCH_DIMENSIONS } from "../constants/pitch.constants.js";
import { PitchService } from "./pitch.service.js";
import { FormationCoordinatesService } from "./formation-coordinate.service.js";
import { TacticsService } from "./tactics.service.js";

type PlayerLine = "DEFENCE" | "MIDFIELD" | "ATTACK";

export interface FormationShape {
  shapePosition: Vector2D;
  roamRadius: number;
}

export class FormationPositioningService {
  private static readonly BALL_PULL = {
    DEFENCE: { x: 0.3, y: 0.25 },
    MIDFIELD: { x: 0.35, y: 0.3 },
    ATTACK: { x: 0.3, y: 0.2 },
  } as const;

  private static readonly MAX_SHIFT = {
    x: 18,
    y: 20,
  } as const;

  private static readonly ROAM_RADIUS = {
    DEFENCE: 13,
    MIDFIELD: 19,
    ATTACK: 21,
  } as const;

  private static readonly FLUIDITY_ROAM: Record<string, number> = {
    RIGID: 0.8,
    FLUID: 1.2,
  };


  private static readonly MAX_DEFENCE_PROGRESS = 0.62;

  private static readonly ATTACKING_DEFENCE_LINE_SHARE = 0.5;

  static getShape(
    slot: FormationSlot,
    phase: MatchPhase,
    ballPosition: Vector2D,
    direction: PlayingDirection,
    fluidity: FormationFluidity,
    tactics: TacticalModifiers = TacticsService.NEUTRAL,
  ): FormationShape {
    const line = this.getLine(slot);

    const normalizedAnchor = this.getAnchor(slot, phase);

    const baseAnchor = FormationCoordinatesService.toPitch(normalizedAnchor);
    const anchor = this.applyTactics(baseAnchor, line, phase, tactics);

    const ball = PitchService.transformPosition(ballPosition, direction);

    const pull = this.BALL_PULL[line];

    // Convert maximum displacement percentages into metres.
    const maxShiftX =
      (this.MAX_SHIFT.x / 100) * PITCH_DIMENSIONS.length;

    const maxShiftY =
      (this.MAX_SHIFT.y / 100) * PITCH_DIMENSIONS.width;

    // Calculate ball influence on the player's horizontal position.
    const shiftX = this.clamp(
      (ball.x - anchor.x) * pull.x,
      -maxShiftX,
      maxShiftX,
    );

    // Calculate ball influence on the player's vertical position.
    const shiftY = this.clamp(
      (ball.y - anchor.y) * pull.y,
      -maxShiftY,
      maxShiftY,
    );

    // Apply the displacement and keep the player inside the pitch.
    const local = PitchService.clampPosition({
      x: anchor.x + shiftX,
      y: anchor.y + shiftY,
    });

    return {
      shapePosition: PitchService.transformPosition(local, direction),

      roamRadius:
        (this.ROAM_RADIUS[line] / 100) *
        PITCH_DIMENSIONS.length *
        (this.FLUIDITY_ROAM[fluidity] ?? 1),
    };
  }

  private static applyTactics(
    anchor: Vector2D,
    line: PlayerLine,
    phase: MatchPhase,
    tactics: TacticalModifiers,
  ): Vector2D {
    let x = anchor.x;

    if (line === "DEFENCE") {
      const share =
        phase === "ATTACKING" ? this.ATTACKING_DEFENCE_LINE_SHARE : 1;

      x += tactics.defensiveLineHeight * share;

      x = Math.min(x, this.MAX_DEFENCE_PROGRESS * PITCH_DIMENSIONS.length);
    } else {
      x += tactics.lineHeight;
    }

    const centreY = PITCH_DIMENSIONS.width / 2;
    const y = centreY + (anchor.y - centreY) * tactics.width;

    return { x, y };
  }

  private static getAnchor(
    slot: FormationSlot,
    phase: MatchPhase,
  ): FormationPosition {
    if (phase === "ATTACKING") {
      return slot.attackingPosition;
    }

    if (phase === "DEFENDING") {
      return slot.defensivePosition;
    }

    // Transition: interpolate halfway between both positions.
    return {
      x: (slot.attackingPosition.x + slot.defensivePosition.x) / 2,
      y: (slot.attackingPosition.y + slot.defensivePosition.y) / 2,
    };
  }

  private static getLine(slot: FormationSlot): PlayerLine {
    const position = String(slot.position).toUpperCase();

    if (/(CB|LB|RB|WB|FB|SW)/.test(position)) {
      return "DEFENCE";
    }

    if (/(ST|CF|FW|LW|RW|WF)/.test(position)) {
      return "ATTACK";
    }

    return "MIDFIELD";
  }

  private static clamp(
    value: number,
    min: number,
    max: number,
  ): number {
    return Math.max(min, Math.min(max, value));
  }
}