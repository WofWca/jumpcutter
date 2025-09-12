<script lang="ts">
  import { tippyActionAsyncPreload as tippy } from "./tippyAction";
  import { fromS } from 'hh-mm-ss'; // TODO it could be lighter. Make a MR or merge it directly and modify.
  import { getMessage } from "@/helpers";
  import type { TelemetryMessage } from '@/entry-points/content/AllMediaElementsController';
  import type { Settings } from "@/settings";

  type RequiredSettings = Pick<Settings, "soundedSpeed" | "timeSavedAveragingMethod" | "timeSavedAveragingWindowLength">
  type RequiredTelemetry = Pick<
    TelemetryMessage,
    | 'elementRemainingIntrinsicDuration'

    | 'timeSavedComparedToSoundedSpeed'
    | 'timeSavedComparedToIntrinsicSpeed'
    | 'wouldHaveLastedIfSpeedWasSounded'
    | 'wouldHaveLastedIfSpeedWasIntrinsic'
  >

  export let latestTelemetryRecord: RequiredTelemetry | undefined;
  export let settings: RequiredSettings;

  let generalTooltipContentEl: HTMLElement;

  function mmSs(s: number): string {
    return fromS(Math.round(s), 'mm:ss');
  }

  $: r = latestTelemetryRecord;
  // TODO I'd prefer to use something like [`with`](https://github.com/sveltejs/svelte/pull/4601)
  $: timeSavedComparedToSoundedSpeedPercent =
    (!r ? 0 : 100 * r.timeSavedComparedToSoundedSpeed / (r.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)).toFixed(1) + '%';
  $: timeSavedComparedToSoundedSpeedAbs =
    mmSs(r?.timeSavedComparedToSoundedSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasSounded =
    mmSs(r?.wouldHaveLastedIfSpeedWasSounded ?? 0);
  $: timeSavedComparedToIntrinsicSpeedPercent =
    (!r ? 0 : 100 * r.timeSavedComparedToIntrinsicSpeed / (r.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)).toFixed(1) + '%';
  $: timeSavedComparedToIntrinsicSpeedAbs =
    mmSs(r?.timeSavedComparedToIntrinsicSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasIntrinsic =
    mmSs(latestTelemetryRecord?.wouldHaveLastedIfSpeedWasIntrinsic ?? 0);

  function formatTimeSaved(num: number) {
    return num.toFixed(2);
  }
  const dummyTimeSavedValues = [
    1,
    1, // TODO use `getAbsoluteClampedSilenceSpeed`?
  ] as [number, number];
  function getTimeSavedPlaybackRateEquivalents(
    r: RequiredTelemetry | undefined
  ): [comparedToSounded: number, comparedToIntrinsic: number] {
    if (!r) {
      return dummyTimeSavedValues;
    }
    // `r.wouldHaveLastedIfSpeedWasIntrinsic - r.timeSavedComparedToIntrinsicSpeed` would be equivalent.
    const lastedActually = r.wouldHaveLastedIfSpeedWasSounded - r.timeSavedComparedToSoundedSpeed;
    if (lastedActually === 0) {
      return dummyTimeSavedValues;
    }
    return [
      r.wouldHaveLastedIfSpeedWasSounded / lastedActually,
      r.wouldHaveLastedIfSpeedWasIntrinsic / lastedActually,
    ]
  }
  function beetween(min: number, x: number, max: number): boolean {
    return min < x && x < max;
  }
  $: timeSavedPlaybackRateEquivalents = getTimeSavedPlaybackRateEquivalents(latestTelemetryRecord);
  $: timeSavedPlaybackRateEquivalentsFmt = [
    formatTimeSaved(timeSavedPlaybackRateEquivalents[0]),
    formatTimeSaved(timeSavedPlaybackRateEquivalents[1]),
  ] as [string, string];
  $: timeSavedPlaybackRateEquivalentsAreDifferent =
    // Can't compare `timeSavedPlaybackRateEquivalents[0]` and `[1]` because due to rounding they can
    // jump between being the same and being different even if you don't change soundedSpeed.
    // Not simply doing a strict comparison (`!==`) because otherwise if you changed soundedSpeed for even
    // a moment, it would never stop showing both numbers.
    !beetween(
      1 / 1.02,
      (
        (r?.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)
        / (r?.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)
      ),
      1.02,
    )
    // Also need to look at this because if `soundedSpeed` was > 1 at first and then it changed to < 1, there will
    // be a point where `wouldHaveLastedIfSpeedWasSounded` and `wouldHaveLastedIfSpeedWasIntrinsic` will become the
    // same (although for a brief moment), despite the soundedSpeed actually never being `=== 1`.
    || (settings && settings.soundedSpeed !== 1);
  $: estimatedRemainingDuration = settings &&
                                  r?.elementRemainingIntrinsicDuration != undefined &&
                                  r.elementRemainingIntrinsicDuration < Infinity
    ? (r.elementRemainingIntrinsicDuration / timeSavedPlaybackRateEquivalents[0]) / settings.soundedSpeed
    : undefined;

  $: maybeOverTheLastLine =
    settings.timeSavedAveragingMethod === "exponential"
      ? `\n${getMessage(
          "overTheLast",
          mmSs(settings.timeSavedAveragingWindowLength)
        )}`
      : "";

  const commonTippyProps = {
    theme: "my-tippy white-space-pre-line",
    placement: "bottom",
    hideOnClick: false,
  } as const
</script>

<!-- TODO perf: it would be cool to disable reactivity when the tooltips are closed. -->
<!-- Why button? So the tooltip can be accessed with no pointer device. Any better ideas? -->
<button
  type="button"
  use:tippy={{
    ...commonTippyProps,
    content: generalTooltipContentEl,
  }}
>
  <span>⏱️</span>
</button>
<!-- TODO this is a little stupid that we have a tooltip for a clock emoji,
especially accessibility-wise. -->
<div style="display:none">
  <div bind:this={generalTooltipContentEl}>
    <p style="margin-top: 0.25rem;">
      <span>{getMessage("timeSaved")}.</span>
    </p>

    <!-- Adding getMessage("overTheLast") here might be "correct",
    but it's perhaps confusing for just the "estimatedRemainingDuration" -->
    {#if
      estimatedRemainingDuration != undefined
      // 10,000 hour sanity check
      && estimatedRemainingDuration < 10000 * 60 * 60
    }
      <p style="margin-bottom: 0.25rem;">
        {getMessage("estimatedRemainingDuration")}<br />
        {mmSs(estimatedRemainingDuration)}<br />
        <!-- Note that this doesn't update when the video is paused. -->
        {new Date(
          Date.now() + estimatedRemainingDuration * 1000
        ).toLocaleTimeString()}
      </p>
    {/if}
  </div>
</div>

<button
  type="button"
  use:tippy={{
    ...commonTippyProps,
    content:
      getMessage("timeSavedComparedToSounded") +
      maybeOverTheLastLine +
      '\n\n' +
      getMessage("timeSavedPercentage") + ' ' +
      timeSavedComparedToSoundedSpeedPercent,
  }}
>
  <span>{timeSavedPlaybackRateEquivalentsFmt[0]}</span>
</button>

{#if settings.timeSavedAveragingMethod !== "exponential"}
  (<button
    type="button"
    use:tippy={{
      ...commonTippyProps,
      content: getMessage("timeSavedComparedToSoundedAbs"),
    }}
  >
    <span>{timeSavedComparedToSoundedSpeedAbs}</span>
  </button>
  /
  <button
    type="button"
    use:tippy={{
      ...commonTippyProps,
      content: getMessage("wouldHaveLastedIfSpeedWasSounded"),
    }}
  >
    <span>{wouldHaveLastedIfSpeedWasSounded}</span>
  </button>)
{/if}


<!-- Don't need to confuse the user with another number if they're equal anyway, especially they're one
of those who use `soundedSpeed=1` -->
{#if timeSavedPlaybackRateEquivalentsAreDifferent}
  <span>/</span>
  <button
    type="button"
    use:tippy={{
      ...commonTippyProps,
      content:
        getMessage("timeSavedComparedToIntrinsic") +
        maybeOverTheLastLine +
        '\n\n' +
        getMessage("timeSavedPercentage") + ' ' +
        timeSavedComparedToIntrinsicSpeedPercent,
    }}
  >
    <span>{timeSavedPlaybackRateEquivalentsFmt[1]}</span>
  </button>
  {#if settings.timeSavedAveragingMethod !== "exponential"}
    (<button
      type="button"
      use:tippy={{
        ...commonTippyProps,
        content: getMessage("timeSavedComparedToIntrinsicAbs"),
      }}
    >
      <span>{timeSavedComparedToIntrinsicSpeedAbs}</span>
    </button>
    /
    <button
      type="button"
      use:tippy={{
        ...commonTippyProps,
        content: getMessage("wouldHaveLastedIfSpeedWasIntrinsic"),
      }}
    >
      <span>{wouldHaveLastedIfSpeedWasIntrinsic}</span>
    </button>)
  {/if}
{/if}

<style>
  button {
    border: none;
    padding: 0;
    background: unset;
    font: inherit;
  }
</style>
