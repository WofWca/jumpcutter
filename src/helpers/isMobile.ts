/** Is `false` if we could not detect for sure. */
export const isMobile = ((navigator as any).userAgentData as any)?.mobile
  ?? /Android|Mobile|iPhone|iPad|iPod/.test(navigator.userAgent);
