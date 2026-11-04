import type { GoalkeeperMatchStats } from "../types/goalkeeper-stats.types.js";
import type { GoalkeeperSaveType } from "../types/goalkeeper.types.js";

export class GoalkeeperStatsService {
  createStats(): GoalkeeperMatchStats {
    return {
      shotsFaced: 0,
      saves: 0,
      catches: 0,
      parries: 0,
      punches: 0,
      goalsConceded: 0,
      crossesClaimed: 0,
      distributionAttempts: 0,
      successfulDistributions: 0,
      cleanSheet: true,
    };
  }

  recordShotFaced(stats: GoalkeeperMatchStats): void {
    stats.shotsFaced++;
  }

  recordSave(
    stats: GoalkeeperMatchStats,
    saveType: GoalkeeperSaveType,
  ): void {
    stats.saves++;

    switch (saveType) {
      case "CATCH":
        stats.catches++;
        break;

      case "PARRY":
        stats.parries++;
        break;

      case "PUNCH":
        stats.punches++;
        break;
    }
  }

  recordGoalConceded(stats: GoalkeeperMatchStats): void {
    stats.goalsConceded++;
    stats.cleanSheet = false;
  }

  recordCrossClaimed(stats: GoalkeeperMatchStats): void {
    stats.crossesClaimed++;
  }

  recordDistribution(
    stats: GoalkeeperMatchStats,
    successful: boolean,
  ): void {
    stats.distributionAttempts++;

    if (successful) {
      stats.successfulDistributions++;
    }
  }

  getSavePercentage(stats: GoalkeeperMatchStats): number {
    if (stats.shotsFaced === 0) {
      return 0;
    }

    return (stats.saves / stats.shotsFaced) * 100;
  }
}