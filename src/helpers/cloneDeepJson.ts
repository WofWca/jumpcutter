export function cloneDeepJson<T>(jsonable: T): T {
  return JSON.parse(JSON.stringify(jsonable));
}
