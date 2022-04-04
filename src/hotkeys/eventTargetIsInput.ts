/**
 * If a key is pressed while typing in an input field, we don't consider this a hotkey.
 * Filter criteria is yoinked from
 * https://github.com/ccampbell/mousetrap/blob/2f9a476ba6158ba69763e4fcf914966cc72ef433/mousetrap.js#L1000
 * and alike libraries. Another reason to rewrite all this using a library.
 * 
 * TODO how about we also/instead check if the target element is a parent of the video element that we're controlling?
 */
export function eventTargetIsInput(event: KeyboardEvent): boolean {
  const t = event.target as Document | HTMLElement;
  return (
    ['INPUT', 'SELECT', 'TEXTAREA']
      // @ts-expect-error 2339 for performance because doing `'tagName' in t` would be redundant, because
      // it is present most of the time.
      .includes(t.tagName)
    // @ts-expect-error 2339 same as above
    || t.isContentEditable
  );
}
