export function assertDev(condition: unknown, msg?: string): asserts condition {
  if (process.env.NODE_ENV !== 'production') {
    if (!condition) {
      console.error(msg);
    }
  }
}
