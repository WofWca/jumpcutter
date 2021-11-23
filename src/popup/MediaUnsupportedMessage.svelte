<script lang="ts">
import { Settings, ControllerKind_CLONING, ControllerKind_STRETCHING, } from '@/settings';
import type { TelemetryMessage } from '@/content/AllMediaElementsController';
import { assertNever } from '@/helpers';

export let settings: Pick<Settings,
  'experimentalControllerType'
  | 'popupChartWidthPx'
  | 'dontAttachToCrossOriginMedia'
>;
export let latestTelemetryRecord: Pick<TelemetryMessage,
  'createMediaElementSourceCalledForElement'
  | 'elementCurrentSrc'
>;
</script>

<section
  style={
    'margin: 1rem 0 0.25rem 0;'
    + 'text-align: center;'
    + 'text-align: center;'
    + `width: ${settings.popupChartWidthPx}px`
  }
>
  <span>⚠️ This media is </span>
  <i>likely</i>
  <span>
    unsupported{
    #if settings.experimentalControllerType === ControllerKind_STRETCHING}
      {' and could get muted if we attach to it.'}
    {:else if settings.experimentalControllerType === ControllerKind_CLONING
      }, silence skipping won't work properly.
    {:else}
      {assertNever(settings.experimentalControllerType)}
    {/if}
  </span>
  <label
    style="display: inline-flex; align-items: center; margin-left: 0.5rem"
  >
    <input
      type="checkbox"
      checked={!settings.dontAttachToCrossOriginMedia}
      on:change={e => settings.dontAttachToCrossOriginMedia = !e.target.checked}
    />
    Try anyway
    <!-- Try -->
  </label>
  {#if settings.dontAttachToCrossOriginMedia && latestTelemetryRecord.createMediaElementSourceCalledForElement}
    <br>
    <!-- <span>⚠️ Reload the page to umute the media.</span> -->
    <span>⚠️ Reload the page if the media got muted.</span>
  {/if}
  <!-- Actually currently `.elementLikelyCorsRestricted === true` guarantees the presence
  of `elementCurrentSrc`, but let's future-prove it. -->
  {#if latestTelemetryRecord.elementCurrentSrc}
    <br>
    Or
    <!-- Set `noreferrer` just for additional "privacy" and stuff. Don't really know what I'm doing.
    Also `nofollow` is pointless, but it's canonical, so I let it be.
    Also `noopener` is implied with `target="_blank"` but idk, maybe something will change
    in the future. -->
    <!-- Added `title` because at least in Chromium it doesn't show the link's href on the screen when
    you hover over it or focus. But they always can rightclick -> copy link address.
    TODO there's probably a better way. -->
    <a
      href={latestTelemetryRecord.elementCurrentSrc}
      target="_blank"
      rel="external nofollow noreferrer noopener"
      title={latestTelemetryRecord.elementCurrentSrc}
    >try opening it directly</a>
  {/if}
</section>
