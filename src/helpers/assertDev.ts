export function assertDev(condition: unknown, msg?: unknown): asserts condition {
  if (process.env.NODE_ENV !== 'production') {
    if (!condition) {
      console.error(msg);
    }
  }
}
