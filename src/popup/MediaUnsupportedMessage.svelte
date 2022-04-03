<script lang="ts">
import { createEventDispatcher } from 'svelte';
import { Settings, ControllerKind_CLONING, ControllerKind_STRETCHING, } from '@/settings';
import type { TelemetryMessage } from '@/content/AllMediaElementsController';
import { assertNever, getMessage } from '@/helpers';

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
  <!-- TODO It's pretty stupid that we have several i18n strings for this sentence. May cause issues
  when we try to add other languages. -->
  <span>⚠️ {getMessage('thisMedia')}</span><i>{getMessage('likely')}</i>
  <span>
    {getMessage('unsupported')} — {
    #if settings.experimentalControllerType === ControllerKind_STRETCHING}
      {getMessage('couldGetMuted')}.
    {:else if settings.experimentalControllerType === ControllerKind_CLONING
      }{getMessage('silenceSkippingWontWork')}.
    {:else}
      {assertNever(settings.experimentalControllerType)}
    {/if}
  </span>
  <!-- Actually currently `.elementLikelyCorsRestricted === true` guarantees the presence
  of `elementCurrentSrc`, but let's future-prove it. -->
  {#if latestTelemetryRecord.elementCurrentSrc}
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
