import type tippy from 'tippy.js';

/**
 * A [Svelte action](https://svelte.dev/docs#use_action). `AsyncPreload` part of the function name just describes how it
 * works in details.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function tippyActionAsyncPreload(node: HTMLElement, props?: Parameters<typeof tippy>[1]) {
  const tippyInstancePromise = (async () => {
    const tippyPromise = import(
      /* webpackPreload */
      /* webpackExports: ['default'] */
      'tippy.js'
    );
    import(/* webpackPreload */ 'tippy.js/dist/tippy.css');
    const tippy = (await tippyPromise).default;
    return tippy(node, {
      ignoreAttributes: true, // For performance.
      ...props,
    });
  })();
  return {
    async update(propsUpdates: Exclude<typeof props, undefined>) {
      (await tippyInstancePromise).setProps(propsUpdates);
    },
    async destroy() {
      // TODO would be better to cancel the promise instead of awaiting it in case it's not fulfilled yet.
      (await tippyInstancePromise).destroy();
    }
  }
}
