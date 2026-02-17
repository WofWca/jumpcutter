export interface ISilenceDetectorEngine {
  update(sample: number, nowMs: number): boolean;
  reset(): void;
}
