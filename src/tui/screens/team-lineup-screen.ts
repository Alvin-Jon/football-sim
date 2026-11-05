import blessed from "blessed";

import type { MatchInitializationService } from "../../modules/football-simulation/services/match-initialization.service.js";
import type { Team } from "../../modules/football-simulation/types/team.types.js";
import type { FormationSlot } from "../../modules/football-simulation/types/formation.types.js";

type Match = ReturnType<typeof MatchInitializationService.initialize>;

type TeamSide = "HOME" | "AWAY";

interface Position {
  x: number;
  y: number;
}

interface LineupPlayer {
  name: string;
  position: string;
  coordinates: Position;
  color: string;
}

export class TeamLineupScreen {
  private screen: blessed.Widgets.Screen;

  private pitch: blessed.Widgets.BoxElement;
  private title: blessed.Widgets.BoxElement;

  private playerMarkers: blessed.Widgets.BoxElement[] = [];

  private currentSide: TeamSide = "HOME";

  constructor(screen: blessed.Widgets.Screen) {
    this.screen = screen;

    this.title = blessed.box({
      top: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: "line",
      align: "center",
      tags: true,
      content: "TEAM LINEUP",
    });

    this.pitch = blessed.box({
      top: 3,
      left: 1,
      width: "100%-2",
      height: "100%-6",
      border: "line",
      content: "",
    });

    this.screen.append(this.title);
    this.screen.append(this.pitch);

    this.drawPitch();
  }

  private drawPitch() {
    const width = Number(this.pitch.width) - 2;
    const height = Number(this.pitch.height) - 2;

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

  private getLineup(
    team: Team,
    side: TeamSide,
  ): LineupPlayer[] {
    return team.players.map((player, index) => {
      const slot = team.formation.slots[index];

      if (!slot) {
        throw new Error(
          `Missing formation slot for ${player.name} at index ${index}`,
        );
      }

      const coordinates =
        side === "HOME"
          ? slot.attackingPosition
          : slot.defensivePosition;

      return {
        name: player.name,
        position: player.position,
        coordinates,
        color: team.color,
      };
    });
  }

  update(match: Match, side: TeamSide = this.currentSide) {
    this.currentSide = side;

    const team =
      side === "HOME" ? match.homeTeam : match.awayTeam;

    this.title.setContent(
      `{bold}${team.name}{/bold}  |  ${team.formation.name}  |  ${side} TEAM`,
    );

    for (const marker of this.playerMarkers) {
      marker.destroy();
    }

    this.playerMarkers = [];

    const players = this.getLineup(team, side);

    const pitchWidth = Number(this.pitch.width) - 2;
    const pitchHeight = Number(this.pitch.height) - 2;

    for (const player of players) {
      const markerWidth = 3;

      const x = Math.round(
        (player.coordinates.x / 100) *
          (pitchWidth - markerWidth),
      );

      const y = Math.round(
        (player.coordinates.y / 68) *
          (pitchHeight - 1),
      );

      // Player name
      const nameWidth = Math.min(
        player.name.length,
        pitchWidth,
      );

      const nameLeft = Math.max(
        0,
        Math.min(
          pitchWidth - nameWidth,
          x + Math.floor(markerWidth / 2) -
            Math.floor(nameWidth / 2),
        ),
      );

      const nameMarker = blessed.box({
        top: Math.max(0, y - 1),
        left: nameLeft,
        width: nameWidth,
        height: 1,
        content: player.name,
        style: {
          fg: "white",
          dim: true,
        },
      });

      // Player position
      const positionMarker = blessed.box({
        top: y,
        left: x,
        width: markerWidth,
        height: 1,
        content: player.position,
        style: {
          fg: player.color,
          bold: true,
        },
      });

      this.pitch.append(nameMarker);
      this.pitch.append(positionMarker);

      this.playerMarkers.push(nameMarker, positionMarker);
    }

    this.show();
  }

  show() {
    this.title.show();
    this.pitch.show();

    this.screen.render();
  }

  hide() {
    this.title.hide();
    this.pitch.hide();

    this.screen.render();
  }
}