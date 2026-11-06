import blessed from "blessed";
import { MatchStatisticsService } from "../modules/football-simulation/services/match-statistics.service.js";
import { PitchScreen } from "./screens/pitch-screen.js";
import type { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";
import { TeamLineupScreen } from "./screens/team-lineup-screen.js";
import { PlayerStatisticsScreen } from "./screens/player-statistics-screen.js";

type Match = ReturnType<typeof MatchInitializationService.initialize>;

type View = "MATCH" | "PITCH" | "STATS" | "LINEUP";

// Game seconds per real second. 1 = real time, 10 = a match in ~9 minutes.
const SPEEDS = [1, 2, 5, 10, 30, 60, 120, 300] as const;
const DEFAULT_SPEED_INDEX = 3;

export class MatchTUI {
  private screen: blessed.Widgets.Screen;

  private scoreboard: blessed.Widgets.BoxElement;
  private possession: blessed.Widgets.BoxElement;
  private stats: blessed.Widgets.BoxElement;
  private events: blessed.Widgets.BoxElement;
  private footer: blessed.Widgets.BoxElement;
  private pitch: PitchScreen;
  private currentMatch: Match | null = null;
  private lineup: TeamLineupScreen;
  private playerStatistics: PlayerStatisticsScreen;

  private view: View = "MATCH";
  private paused = false;
  private speedIndex = DEFAULT_SPEED_INDEX;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Football Simulator",
      fullUnicode: true,
    });
    this.lineup = new TeamLineupScreen(this.screen);
    this.pitch = new PitchScreen(this.screen);
    this.playerStatistics = new PlayerStatisticsScreen(this.screen);

    this.scoreboard = blessed.box({
      top: 0,
      left: 0,
      width: "100%",
      height: 5,
      border: "line",
      tags: true,
      align: "center",
      content: "Initializing match...",
    });

    this.possession = blessed.box({
      top: 5,
      left: 0,
      width: "100%",
      height: 5,
      border: "line",
      tags: true,
      content: "",
    });

    this.stats = blessed.box({
      top: 10,
      left: 0,
      width: "50%",
      height: "70%-3",
      border: "line",
      tags: true,
      content: "",
    });

    this.events = blessed.box({
      top: 10,
      left: "50%",
      width: "50%",
      height: "70%-3",
      border: "line",
      tags: true,
      content: "Match events will appear here.",
    });

    this.footer = blessed.box({
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: "line",
      align: "center",
      content:
        "[1] Match  [2] Pitch  [3] Players  [4] Lineup  [H]/[A] Team  [SPACE] Pause  [+/-] Speed  [Q] Quit",
    });
    this.screen.append(this.scoreboard);
    this.screen.append(this.possession);
    this.screen.append(this.stats);
    this.screen.append(this.events);
    this.screen.append(this.footer);

    this.screen.key(["q", "C-c"], () => {
      this.destroy();
      process.exit(0);
    });

    this.screen.key(["space"], () => {
      this.paused = !this.paused;
      this.refreshHeader();
    });

    this.screen.key(["+", "=", "]"], () => {
      this.speedIndex = Math.min(SPEEDS.length - 1, this.speedIndex + 1);
      this.refreshHeader();
    });

    this.screen.key(["-", "_", "["], () => {
      this.speedIndex = Math.max(0, this.speedIndex - 1);
      this.refreshHeader();
    });

    this.screen.key(["1"], () => {
      this.showMatchScreen();
    });

    this.screen.key(["2"], () => {
      this.showPitchScreen();
    });

    this.screen.key(["3"], () => {
      this.showStatsScreen();
    });

    this.screen.key(["4"], () => {
      this.showLineupScreen("HOME");
    });

    this.screen.key(["h"], () => {
      if (this.currentMatch) {
        this.showLineupScreen("HOME");
      }
    });

    this.screen.key(["a"], () => {
      if (this.currentMatch) {
        this.showLineupScreen("AWAY");
      }
    });

    this.screen.render();
  }

  /** Whether the simulation should be advancing. */
  isPaused(): boolean {
    return this.paused;
  }

  /** Playback speed in game seconds per real second. */
  getSpeed(): number {
    return SPEEDS[this.speedIndex] ?? 1;
  }

  /**
   * Cheap: stores the match and refreshes only the widgets for the screen
   * that is currently showing. Does NOT redraw the terminal; call render()
   * once per frame for that.
   */
  update(match: Match): void {
    this.currentMatch = match;

    switch (this.view) {
      case "MATCH":
        this.updateScoreboard(match);
        this.updatePossession(match);
        this.updateStats(match);
        break;

      case "PITCH":
        this.updateScoreboard(match);
        this.pitch.updateMatch(match);
        break;

      case "STATS":
        this.playerStatistics.update(match);
        break;

      case "LINEUP":
        break;
    }
  }

  /** Redraws the terminal. Call once per frame. */
  render(): void {
    this.screen.render();
  }

  private refreshHeader(): void {
    if (this.currentMatch && (this.view === "MATCH" || this.view === "PITCH")) {
      this.updateScoreboard(this.currentMatch);
    }
    this.screen.render();
  }

  private updateScoreboard(match: Match): void {
    const { home, away } = match.statistics;

    const state = this.paused ? "  |  {bold}PAUSED{/bold}" : "";

    this.scoreboard.setContent(
      `{bold}${match.homeTeam.name}{/bold} ` +
        `${home.goals} - ${away.goals} ` +
        `{bold}${match.awayTeam.name}{/bold}\n` +
        `Minute ${match.clock.minute}' | ` +
        `Half ${match.clock.half} | ` +
        `Speed x${this.getSpeed()}${state}`,
    );
  }

  private updatePossession(match: Match): void {
    const possession = MatchStatisticsService.getPossessionPercentage(match);

    this.possession.setContent(
      `Possession\n\n` +
        `${match.homeTeam.name}  ${this.progressBar(possession.home)} ${possession.home}%\n` +
        `${match.awayTeam.name}  ${this.progressBar(possession.away)} ${possession.away}%`,
    );
  }

  private updateStats(match: Match): void {
    const { home, away } = match.statistics;
    const passingAccuracy = MatchStatisticsService.getPassingAccuracy(match);

    this.stats.setContent(
      `MATCH STATISTICS\n\n` +
        `Shots:              ${home.shots} - ${away.shots}\n` +
        `Shots on Target:    ${home.shotsOnTarget} - ${away.shotsOnTarget}\n` +
        `Passes Attempted:  ${home.passesAttempted} - ${away.passesAttempted}\n` +
        `Passes Completed:  ${home.passesCompleted} - ${away.passesCompleted}\n` +
        `Passing Accuracy:  ${passingAccuracy.home}% - ${passingAccuracy.away}%\n` +
        `Tackles Attempted: ${home.tacklesAttempted} - ${away.tacklesAttempted}\n` +
        `Tackles Won:       ${home.tacklesWon} - ${away.tacklesWon}\n` +
        `Interceptions:     ${home.interceptions} - ${away.interceptions}\n` +
        `Saves:             ${home.saves} - ${away.saves}`,
    );
  }

  private progressBar(value: number): string {
    const width = 25;
    const filled = Math.round((value / 100) * width);

    return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "]";
  }

  private hideAllViews(): void {
    this.lineup.hide();
    this.playerStatistics.hide();
    this.pitch.hide();

    this.scoreboard.hide();
    this.possession.hide();
    this.stats.hide();
    this.events.hide();
  }

  private showMatchScreen(): void {
    this.view = "MATCH";
    this.hideAllViews();

    this.scoreboard.show();
    this.possession.show();
    this.stats.show();
    this.events.show();

    if (this.currentMatch) {
      this.update(this.currentMatch);
    }

    this.screen.render();
  }

  private showLineupScreen(side: "HOME" | "AWAY"): void {
    this.view = "LINEUP";
    this.hideAllViews();

    if (this.currentMatch) {
      this.lineup.update(this.currentMatch, side);
    }
  }

  private showStatsScreen(): void {
    this.view = "STATS";
    this.hideAllViews();

    if (this.currentMatch) {
      this.playerStatistics.update(this.currentMatch);
    }

    this.playerStatistics.show();
    this.screen.render();
  }

  private showPitchScreen(): void {
    this.view = "PITCH";
    this.hideAllViews();

    this.scoreboard.show();

    if (this.currentMatch) {
      this.update(this.currentMatch);
    }

    this.pitch.show();
    this.screen.render();
  }

  destroy(): void {
    this.screen.destroy();
  }
}