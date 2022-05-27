/**
 * @license
 * Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

import type tippy from 'tippy.js';

/**
 * A [Svelte action](https://svelte.dev/docs#use_action). `AsyncPreload` part of the function name just describes how it
 * works in details.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function tippyActionAsyncPreload(node: HTMLElement, props?: Parameters<typeof tippy>[1]) {
  const tippyInstancePromise = (async () => {
    const tippyPromise = import(
      /* webpackPreload: true */
      /* webpackExports: ['default'] */
      'tippy.js'
    );
    import(/* webpackPreload: true */ 'tippy.js/dist/tippy.css');
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
