import blessed from "blessed";

import type { Player } from "../../modules/football-simulation/types/player.types.js";
import type { FormationSlot } from "../../modules/football-simulation/types/formation.types.js";
import type { MatchInitializationService } from "../../modules/football-simulation/services/match-initialization.service.js";

interface Position {
  x: number;
  y: number;
}

interface PitchPlayer {
  player: Player;
  position: Position;
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

    this.screen.append(this.pitch);
    this.screen.append(this.ballMarker);

    this.drawPitch();
  }

  private drawPitch() {
    const width = Number(this.pitch.width) || 80;
    const height = Number(this.pitch.height) || 24;

    const lines: string[] = [];

    for (let y = 0; y < height; y++) {
      let line = "";

      for (let x = 0; x < width; x++) {
        if (x === Math.floor(width / 2)) {
          line += "│";
        } else {
          line += " ";
        }
      }

      lines.push(line);
    }

    this.pitch.setContent(lines.join("\n"));
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
    };
  });

  const awayPlayers = match.awayTeam.players.map((player) => {
    const playerState =
      match.awayTeamState.playerStates[player.id]!;

    return {
      player,
      position: {
        x: playerState.position.x,
        y: playerState.position.y,
      },
      team: "AWAY" as const,
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

    for (const player of players) {
      const x = Math.round(
        (player.position.x / 100) * (pitchWidth - markerWidth),
        );

        const y = Math.round(
        (player.position.y / 68) * (pitchHeight - markerHeight),
        );
      const marker = blessed.box({
        top: y,
        left: x,
        width: 3,
        height: 1,
        content: player.player.position,
        style: {
          fg: player.team === "HOME" ? "blue" : "red",
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

    this.ballMarker.top = Math.round(
      (position.y / 68) * pitchHeight,
    );

    this.ballMarker.left = Math.round(
      (position.x / 100) * pitchWidth,
    );

    this.screen.render();
  }

  show() {
    this.pitch.show();
    this.ballMarker.show();

    for (const marker of this.playerMarkers) {
      marker.show();
    }

    this.screen.render();
  }

  hide() {
    this.pitch.hide();
    this.ballMarker.hide();

    for (const marker of this.playerMarkers) {
      marker.hide();
    }

    this.screen.render();
  }
}
