<!--
Copyright (C) 2021, 2022  WofWca <wofwca@protonmail.com>

This file is part of Jump Cutter Browser Extension.

Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Jump Cutter Browser Extension is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
import { createEventDispatcher } from 'svelte';
import { Settings, ControllerKind_CLONING, ControllerKind_STRETCHING, } from '@/settings';
import type { TelemetryMessage } from '@/entry-points/content/AllMediaElementsController';
import { assertNever, getMessage } from '@/helpers';
import { isMobile } from '@/helpers/isMobile';
import { browserOrChrome } from '@/webextensions-api-browser-or-chrome';

export let settings: Pick<Settings,
  'experimentalControllerType'
  | 'popupChartWidthPx'
  | 'dontAttachToCrossOriginMedia'
>;
export let latestTelemetryRecord: Pick<TelemetryMessage,
  'createMediaElementSourceCalledForElement'
  | 'elementCurrentSrc'
>;

const dispatch = createEventDispatcher();
function onDontAttachToCrossOriginMediaChange(e: Event) {
  dispatch('dontAttachToCrossOriginMediaChange', !(e.target as HTMLInputElement).checked);
}
</script>

<section
  style={
    'margin: 1rem 0 0.25rem 0;'
    + 'text-align: center;'
    + 'text-align: center;'
    + `width: ${settings.popupChartWidthPx}px`
  }
>
  ⚠️
  {#each (
    getMessage(
      'mediaUnsupported',
      settings.experimentalControllerType === ControllerKind_STRETCHING
      ? getMessage('couldGetMuted')
      : settings.experimentalControllerType === ControllerKind_CLONING
      ? getMessage('silenceSkippingWontWork')
      : assertNever(settings.experimentalControllerType)
    ).split('**')
  ) as part, i}
    {#if i !== 1}
      <span>{part}</span>
    {:else}
      <i>{part}</i>
    {/if}
  {/each}
  <!-- Actually currently `.elementLikelyCorsRestricted === true` guarantees the presence
  of `elementCurrentSrc`, but let's future-prove it. -->
  {#if latestTelemetryRecord.elementCurrentSrc}
    <!-- role="link" tabindex="0" are needed for a11y when 'href' is empty
    and we use `onClick` instead. Same approach as for `openLocalFile`. -->
    <!-- svelte-ignore a11y-no-redundant-roles -->
    <!-- Set `noreferrer` just for additional "privacy" and stuff. Don't really know what I'm doing.
    Also `nofollow` is pointless, but it's canonical, so I let it be.
    Also `noopener` is implied with `target="_blank"` but idk, maybe something will change
    in the future. -->
    <!-- Added `title` because at least in Chromium it doesn't show the link's href on the screen when
    you hover over it or focus. But they always can rightclick -> copy link address.
    TODO there's probably a better way. -->
    <a
      href={!isMobile ? latestTelemetryRecord.elementCurrentSrc : undefined}
      target="_blank"
      rel="external nofollow noreferrer noopener"
      title={latestTelemetryRecord.elementCurrentSrc}

      on:click={!isMobile
        ? undefined
        : () => {
          browserOrChrome.tabs.create({
            url: latestTelemetryRecord.elementCurrentSrc
          });
          window.close();
        }
      }
      role="link"
      tabindex="0"
    >{getMessage('tryOpeningDirectly')}</a>

    <br>
    {getMessage('or')}
  {:else}
    <br>
  {/if}
  <label
    style="display: inline-flex; align-items: center; margin-left: 0.25rem"
  >
    <input
      type="checkbox"
      checked={!settings.dontAttachToCrossOriginMedia}
      on:change={onDontAttachToCrossOriginMediaChange}
    />
    {getMessage('tryAttachAnyway')}
    <!-- Try -->
  </label>
  {#if settings.dontAttachToCrossOriginMedia && latestTelemetryRecord.createMediaElementSourceCalledForElement}
    <br>
    <!-- <span>⚠️ Reload the page to umute the media.</span> -->
    <span>⚠️ {getMessage('refreshIfMuted')}.</span>
  {/if}
</section>
