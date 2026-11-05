import blessed from "blessed";
import { MatchStatisticsService } from "../modules/football-simulation/services/match-statistics.service.js";
import { PitchScreen } from "./screens/pitch-screen.js";
import type { MatchInitializationService } from "../modules/football-simulation/services/match-initialization.service.js";

type Match = ReturnType<typeof MatchInitializationService.initialize>;

export class MatchTUI {
  private screen: blessed.Widgets.Screen;

  private scoreboard: blessed.Widgets.BoxElement;
  private possession: blessed.Widgets.BoxElement;
  private stats: blessed.Widgets.BoxElement;
  private events: blessed.Widgets.BoxElement;
  private footer: blessed.Widgets.BoxElement;
  private pitch: PitchScreen;
  private currentMatch: Match | null = null;

  private paused = false;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: "Football Simulator",
      fullUnicode: true,
    });
    
    this.pitch = new PitchScreen(this.screen);

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
      content: "[1] Match  [2] Pitch  [3] Stats  [SPACE] Pause  [Q] Quit",
    });

    this.screen.append(this.scoreboard);
    this.screen.append(this.possession);
    this.screen.append(this.stats);
    this.screen.append(this.events);
    this.screen.append(this.footer);

    this.screen.key(["q", "C-c"], () => {
      this.destroy();
    });

    this.screen.key(["space"], () => {
      this.paused = !this.paused;
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

    this.screen.render();
  }

  update(match: Match) {
    if (this.paused) {
      return;
    }

    const { home, away } = match.statistics;

    const possession =
      MatchStatisticsService.getPossessionPercentage(match);

    const passingAccuracy =
      MatchStatisticsService.getPassingAccuracy(match);

    this.scoreboard.setContent(
      `{bold}${match.homeTeam.name}{/bold} ` +
      `${home.goals} - ${away.goals} ` +
      `{bold}${match.awayTeam.name}{/bold}\n` +
      `Minute ${match.clock.minute}' | ` +
      `Half ${match.clock.half}`,
    );

    this.possession.setContent(
      `Possession\n\n` +
      `${match.homeTeam.name}  ${this.progressBar(possession.home)} ${possession.home}%\n` +
      `${match.awayTeam.name}  ${this.progressBar(possession.away)} ${possession.away}%`,
    );

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
    this.pitch.updateMatch(match);

    this.screen.render();
  }

  private progressBar(value: number): string {
    const width = 25;
    const filled = Math.round((value / 100) * width);

    return (
      "[" +
      "█".repeat(filled) +
      "░".repeat(width - filled) +
      "]"
    );
  }

 private showMatchScreen() {
  this.pitch.hide();

  this.scoreboard.show();
  this.possession.show();
  this.stats.show();
  this.events.show();

  this.screen.render();
}

private showStatsScreen() {
  this.pitch.hide();

  this.scoreboard.show();
  this.stats.show();

  this.possession.hide();
  this.events.hide();

  this.screen.render();
}

 private showPitchScreen() {
  this.scoreboard.show();
  this.footer.show();

  this.possession.hide();
  this.stats.hide();
  this.events.hide();

  if (this.currentMatch) {
    this.pitch.updateMatch(this.currentMatch);
  }

  this.pitch.show();
  this.screen.render();
}


  destroy() {
    this.screen.destroy();
  }
}