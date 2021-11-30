// TODO if it get standardized, we can simplify this.
export const requestIdleCallbackPolyfill: (
  cb: () => void,
  options?: Parameters<typeof requestIdleCallback>[1]
) => void
= typeof requestIdleCallback !== 'undefined'
  ? requestIdleCallback
  : (cb: () => void) => setTimeout(() => setTimeout(cb));
