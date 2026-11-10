export interface TacticalModifiers {
  readonly lineHeight: number;
  readonly defensiveLineHeight: number;
  readonly width: number;


  readonly pressChasers: number;
  readonly pressMaxProgress: number;
  readonly pressBonus: number;

  readonly holdTempo: number;
  readonly directness: number;
  readonly riskTolerance: number;
  readonly shootBias: number;
  readonly dribbleBias: number;
  readonly holdBias: number;
  readonly crossBias: number;
  readonly passLaneWeight: number;
  readonly passPressureWeight: number;
  readonly passProgressionWeight: number;
  readonly passMinCompletion: number;
  readonly passRecycleBias: number;
  readonly passTurnoverCost: number;
}