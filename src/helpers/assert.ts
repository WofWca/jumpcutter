// TODO but `msg` arguments still not eliminated in production.
export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg);
    } else {
      throw new Error();
    }
  }
}
