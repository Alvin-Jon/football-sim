import blessed from "blessed";

import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { FormationSlot } from "../../modules/football-simulation/types/formation.types.js";
import type { MatchInitializationService } from "../../modules/football-simulation/services/match-initialization.service.js";
import { PitchService } from "../../modules/football-simulation/index.js";

interface Position {
  x: number;
  y: number;
}

interface PitchPlayer {
  player: Player;
  position: Position;
  color: string;
  team: "HOME" | "AWAY";
}

type Match = ReturnType<typeof MatchInitializationService.initialize>;

type TeamDirection = "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";

// Converts formation coordinates into the appropriate tactical position.
function playerPosition(
  slot: FormationSlot,
  direction: TeamDirection,
): Position {
  const position =
    direction === "LEFT_TO_RIGHT"
      ? slot.attackingPosition
      : slot.defensivePosition;

  return {
    x: position.x,
    y: position.y,
  };
}

export class PitchScreen {
  private screen: blessed.Widgets.Screen;

  private pitch: blessed.Widgets.BoxElement;

  private playerMarkers: blessed.Widgets.BoxElement[] = [];

  private ballMarker: blessed.Widgets.BoxElement;
  private renderInterval = 33; // 10 FPS
  private lastRenderTime = 0;
  private renderPending = false;
  private halfwayLine: blessed.Widgets.BoxElement;
  

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    this.pitch = blessed.box({
      top: 1,
      left: 1,
      width: "100%-2",
      height: "100%-4",
      border: "line",
      content: "",
      tags: true,
    });

    this.ballMarker = blessed.box({
      width: 1,
      height: 1,
      content: "●",
      style: {
        fg: "yellow",
        bold: true,
      },
    });

    this.halfwayLine = blessed.box({
      top: 0,
      left: "50%",
      width: 1,
      height: "100%-2",
      content: "│",
      style: {
        fg: "white",
      },
    });

    this.pitch.append(this.halfwayLine);

    this.screen.append(this.pitch);
    this.pitch.append(this.ballMarker);

    this.drawPitch();
    this.screen.render();
  }

  private requestRender() {
    const now = Date.now();

    if (now - this.lastRenderTime >= this.renderInterval) {
      this.lastRenderTime = now;
      this.screen.render();
      return;
    }

    if (this.renderPending) return;

    this.renderPending = true;

    setTimeout(() => {
      this.renderPending = false;
      this.lastRenderTime = Date.now();
      this.screen.render();
    }, this.renderInterval - (now - this.lastRenderTime));
  }

  private drawPitch() {
    const height = (this.pitch.height as number) - 2;

    const lines = Array.from(
      { length: height },
      () => "│",
    );

    this.halfwayLine.setContent(lines.join("\n"));
  }

  // Resolves both teams' players into pitch coordinates.
  getPitchPlayers(match: Match): PitchPlayer[] {
  const homePlayers = match.homeTeam.players.map((player) => {
  const playerState = match.homeTeamState.playerStates[player.id]!;

    return {
      player,
      position: {
        x: playerState.position.x,
        y: playerState.position.y,
      },
      team: "HOME" as const,
      color: match.homeTeam.color
    };
  });

  const awayPlayers = match.awayTeam.players.map((player) => {
    const playerState = match.awayTeamState.playerStates[player.id]!;


    return {
      player,
      position: {
        x: playerState.position.x,
        y: playerState.position.y,
      },
      team: "AWAY" as const,
      color: match.awayTeam.color
    };
  });

  return [...homePlayers, ...awayPlayers];
}

  updatePlayers(players: PitchPlayer[]) {
    for (const marker of this.playerMarkers) {
      marker.destroy();
    }

    this.playerMarkers = [];
    const markerWidth = 3;
    const markerHeight = 1;

    const pitchWidth = Number(this.pitch.width) - 2;
    const pitchHeight = Number(this.pitch.height) - 2;

    const { length, width } = PitchService.getDimensions(); 

    for (const player of players) {
      const x = Math.round(
        (player.position.x / length) * (pitchWidth - markerWidth),
        );

        const y = Math.round(
        (player.position.y / width) * (pitchHeight - markerHeight),
        );
      const marker = blessed.box({
        top: y,
        left: x,
        width: 3,
        height: 1,
        content: player.player.position,
        style: {
          fg: player.color,
          bold: true,
        },
      });

      this.pitch.append(marker);

      this.playerMarkers.push(marker);
    }
  }

  // Convenience method: resolve players directly from match state.
  updateMatch(match: Match) {
    this.updatePlayers(this.getPitchPlayers(match));
    this.updateBall(match.ball.position);
  }

  updateBall(position: Position) {
    const pitchWidth = Number(this.pitch.width) - 2;
    const pitchHeight = Number(this.pitch.height) - 2;

    const { length, width } = PitchService.getDimensions();

    this.ballMarker.top = Math.round(
      (position.y / width) * pitchHeight,
    );

    this.ballMarker.left = Math.round(
      (position.x / length) * pitchWidth,
    );

    this.requestRender();
  }

  show() {
    this.pitch.show();
    this.ballMarker.show();

    for (const marker of this.playerMarkers) {
      marker.show();
    }

    this.requestRender();
  }

  hide() {
    this.pitch.hide();
    this.ballMarker.hide();

    for (const marker of this.playerMarkers) {
      marker.hide();
    }

    this.requestRender();
  }
}
