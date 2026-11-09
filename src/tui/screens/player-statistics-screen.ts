import blessed from "blessed";

import type { MatchInitializationService } from "../../modules/football-simulation/services/match-initialization.service.js";
import type { PlayerMatchStatistics } from "../../modules/football-simulation/types/statistics.types.js";

type Match = ReturnType<typeof MatchInitializationService.initialize>;

export class PlayerStatisticsScreen {
  private homePanel: blessed.Widgets.BoxElement;
private awayPanel: blessed.Widgets.BoxElement;

constructor(private screen: blessed.Widgets.Screen) {
  this.homePanel = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "50%-2",
    border: "line",
    label: " HOME PLAYER STATISTICS ",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: "│",
      track: {
        ch: "│",
      },
    },
    keys: true,
    vi: true,
    mouse: true,
  });

  this.awayPanel = blessed.box({
    top: "50%-1",
    left: 0,
    width: "100%",
    height: "50%-2",
    border: "line",
    label: " AWAY PLAYER STATISTICS ",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: "│",
      track: {
        ch: "│",
      },
    },
    keys: true,
    vi: true,
    mouse: true,
  });

  this.screen.append(this.homePanel);
  this.screen.append(this.awayPanel);

  this.homePanel.key(["up", "k"], () => {
  this.homePanel.scroll(-1);
  this.screen.render();
});

this.homePanel.key(["down", "j"], () => {
  this.homePanel.scroll(1);
  this.screen.render();
});

this.awayPanel.key(["up", "k"], () => {
  this.awayPanel.scroll(-1);
  this.screen.render();
});

this.awayPanel.key(["down", "j"], () => {
  this.awayPanel.scroll(1);
  this.screen.render();
});

  this.hide();
}

  update(match: Match): void {
    const { players } = match.statistics;

    this.homePanel.setLabel(` ${match.homeTeam.name} `);
    this.awayPanel.setLabel(` ${match.awayTeam.name} `);

    this.homePanel.setContent(
      this.renderTeamPlayers(match.homeTeam.players, players),
    );

    this.awayPanel.setContent(
      this.renderTeamPlayers(match.awayTeam.players, players),
    );

    // this.homePanel.setScroll(0);
    // this.awayPanel.setScroll(0);

    this.screen.render();
  }

  private renderTeamPlayers(
    teamPlayers: Match["homeTeam"]["players"],
    statistics: Match["statistics"]["players"],
  ): string {
    const columns = [
      this.pad("PLAYER", 22),
      this.pad("G", 3),
      this.pad("A", 3),
      this.pad("SH", 4),
      this.pad("SOT", 4),
      this.pad("PASS", 9),
      this.pad("TKL", 9),
      this.pad("INT", 5),
      this.pad("SV", 5),
    ].join(" ");

    const separator = "─".repeat(columns.length);

    const rows = teamPlayers.map((player) => {
      const stats = statistics[player.id] ?? this.emptyStats();

      return [
        this.pad(`${player.position} ${player.name}`, 22),
        this.pad(String(stats.goals), 3),
        this.pad(String(stats.assists), 3),
        this.pad(String(stats.shots), 4),
        this.pad(String(stats.shotsOnTarget), 4),
        this.pad(
          `${stats.passesCompleted}/${stats.passesAttempted}`,
          9,
        ),
        this.pad(
          `${stats.tacklesWon}/${stats.tacklesAttempted}`,
          9,
        ),
        this.pad(String(stats.interceptions), 5),
        this.pad(String(stats.saves), 5),
      ].join(" ");
    });

    return [
      columns,
      separator,
      ...rows,
    ].join("\n");
  }

  private emptyStats(): PlayerMatchStatistics {
    return {
      passesAttempted: 0,
      passesCompleted: 0,
      shots: 0,
      shotsOnTarget: 0,
      goals: 0,
      assists: 0,
      tacklesAttempted: 0,
      tacklesWon: 0,
      interceptions: 0,
      saves: 0,
      passBreakdown: {
        SHORT:{
          attempted: 0,
          completed: 0,
        },
        LONG: {
          attempted: 0,
          completed: 0,
        },
        THROUGH: {
          attempted: 0,
          completed: 0,
        },
        CROSS: {
          attempted: 0,
          completed: 0,
        },
      }
    };
  }

  private pad(value: string, width: number): string {
    return value.length > width
      ? value.slice(0, width)
      : value.padEnd(width);
  }

  show(): void {
    this.homePanel.show();
    this.awayPanel.show();
    this.screen.render();
  }

  hide(): void {
    this.homePanel.hide();
    this.awayPanel.hide();
  }
}