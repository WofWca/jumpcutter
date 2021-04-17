import { Settings } from "./";

export const localStorageOnlyKeys: Readonly<Array<keyof Settings>> = ['__lastHandledUpdateToVersion'] as const;
