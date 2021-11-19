/**
 * Browsers (at least at the time of writing, at least Gecko and Chromium) use different audio data pipelines for normal
 * (1.0) and non-normal speeds, and switching between them causes an audio glitch:
 * https://github.com/chromium/chromium/blob/8af9895458f5ac16b2059ca8a336da6367188409/media/renderers/audio_renderer_impl.h#L16-L17
 * This is to make it impossible for the user to set speed to no normal.
 * TODO give users an option (on the options page) to skip this transformation.
 */
export function closestNonNormalSpeed(speed: number): number {
  // On Chromium 86.0.4240.99, it appears that 1.0 is not the only "normal" speed. It's a small proximity of 1.0.
  //
  // It's not the smallest, but a value close to the smallest value for which the audio
  // stream start going through the stretcher algorithm. Initially after a bit of experimentation I set this value to
  // `1.00105`, but then as I added local file support, it became apparent that for some files it's not enough.
  // For some files it appeared to be just below 1.001135. To be on a safer side, let's set it to a slightly bigger
  // value until we figure out what it really is. TODO.
  const smallestNonNormalAbove1 = 1.002;
  // Actually I'm not sure if there's such a relation between the biggest and the smallest.
  const biggestNonNormalBelow1 = 1 - (smallestNonNormalAbove1 - 1);

  if (biggestNonNormalBelow1 < speed && speed < smallestNonNormalAbove1) {
    return smallestNonNormalAbove1 - speed < speed - biggestNonNormalBelow1
      ? biggestNonNormalBelow1
      : smallestNonNormalAbove1;
  }
  return speed;
}
