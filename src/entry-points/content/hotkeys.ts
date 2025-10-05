import type { keydownEventToActions } from '@/hotkeys'

export default async function initHotkeyListener({
  getSettings,
  setSettings,
  getActiveMediaElement,
  onStop,
}: {
  getSettings: () => Parameters<typeof keydownEventToActions>[1],
  setSettings: (newValues: Exclude<ReturnType<typeof keydownEventToActions>, undefined>[0]) => void,
  getActiveMediaElement: () => HTMLMediaElement | undefined,
  onStop: (callback: () => void) => void
}) {
  const actionsModuleP = import(
    /* webpackExports: ['default'] */
    './nonSettingsUserActions'
  )
  const hotkeysModule = await import(
    /* webpackExports: ['keydownEventToActions', 'eventTargetIsInput'] */
    '@/hotkeys'
  );
  const keydownEventToActions = hotkeysModule.keydownEventToActions;
  const eventTargetIsInput = hotkeysModule.eventTargetIsInput;
  const executeNonSettingsActions = (await actionsModuleP).default
  const handleKeydown = (e: KeyboardEvent) => {
    if (eventTargetIsInput(e)) return;
    const actions = keydownEventToActions(e, getSettings());
    if (!actions) {
      return;
    }
    const element = getActiveMediaElement()
    if (element == undefined) {
      return;
    }
    const [ settingsNewValues, nonSettingsActions, overrideWebsiteHotkeys ] = actions;

    // Works because `useCapture` of `addEventListener` is `true`. However, it's not guaranteed to work on every
    // website, as they might as well set `useCapture` to `true`. TODO fix. Somehow. Maybe attach it before
    // website's listeners get attached, by adding a `"run_at": "document_start"` content script.
    // https://github.com/igrigorik/videospeed/blob/56eb7a08459d6746a0019b0b0c4edf974c022114/inject.js#L592-L596
    if (overrideWebsiteHotkeys) {
      e.preventDefault();
      e.stopPropagation();
    }

    setSettings(settingsNewValues)

    executeNonSettingsActions(element, nonSettingsActions);
  };
  // You might ask "Why don't you just use the native [commands API](https://developer.chrome.com/apps/commands)?"
  // And the answer is – you may be right. But here's a longer version:
  // * Our hotkeys are different from hotkeys you might have seen in videogames in the fact that ours are mostyly
  //   associated with an argument. Native hotkeys don't have this feature. We might have just strapped arguments to
  // native hotkeys on the options page, but it'd be a bit confusing.
  // * Docs say, "An extension can have many commands but only 4 suggested keys can be specified". Our extension has
  // quite a lot of hotkeys, each user would have to manually bind each of them.
  // * Native hotkeys are global to the browser, so it's quite nice when our hotkeys are only active when the
  // extension is enabled (with `enabled` setting) and is attached to a video.
  // * What gains are there? Would performance overhead be that much lower? Would it be lower at all?
  // * Keeps opportunities for more fine-grained control.
  // * Because I haven't considered it thorougly enough.
  //
  // Adding the listener to `document` instead of `video` because some websites (like YouTube) use custom players,
  // which wrap around a video element, which is not ever supposed to be in focus.
  //
  // Why not always attach with `useCapture = true`? For performance.
  // TODO but if the user changed `overrideWebsiteHotkeys` for some binding, an extension reload will
  // be required. React to settings changes?
  if (getSettings().hotkeys.some(binding => binding.overrideWebsiteHotkeys)) {
    // `useCapture` is true because see `overrideWebsiteHotkeys`.
    document.addEventListener('keydown', handleKeydown, true);
    onStop(() => document.removeEventListener('keydown', handleKeydown, true));
  } else {
    // Deferred because it's not top priority. But maybe it should be?
    // Yes, it would mean that the `if (overrideWebsiteHotkeys) {` inside `handleKeydown` will always
    // be false.
    const handleKeydownDeferred =
      (...args: Parameters<typeof handleKeydown>) => setTimeout(handleKeydown, undefined, ...args);
    document.addEventListener('keydown', handleKeydownDeferred, { passive: true });
    onStop(() => document.removeEventListener('keydown', handleKeydownDeferred));
  }
  // this.hotkeyListenerAttached = true;
}