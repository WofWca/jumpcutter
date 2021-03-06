import { Time } from "@/helpers";

export const enum SilenceDetectorEventType {
  SILENCE_END,
  SILENCE_START,
}

export type SilenceDetectorMessage = [type: SilenceDetectorEventType, time: Time];
