export function isSourceCrossOrigin(el: HTMLMediaElement): boolean {
  // `el.currentSrc` may be empty even if the media is playing when `el.srcObject` is used instead of `el.src`,
  // or if the element got inserted befiore it got assigned `src`.
  // TODO research whether it can still be cross-origin in this case.
  let elCurrentSrcUrl: URL;
  try {
    elCurrentSrcUrl = new URL(el.currentSrc);
  } catch (e) {
    if (!(e instanceof TypeError)) {
      throw e;
    }
    // I don't know if this could be incorrect, but it's good enough for our case.
    return false;
  }
  return elCurrentSrcUrl.origin !== document.location.origin;
}
