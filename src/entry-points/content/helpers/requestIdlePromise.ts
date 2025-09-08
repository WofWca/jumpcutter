import { requestIdleCallbackPolyfill } from "./requestIdleCallbackPolyfill";

export default function requestIdlePromise(
  options?: Parameters<typeof requestIdleCallbackPolyfill>[1]
) {
  return new Promise<void>((r) => requestIdleCallbackPolyfill(r, options));
}
