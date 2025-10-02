<script lang="ts">
  import { tippyActionAsyncPreload as tippy } from "./tippyAction";
  import { fromS } from 'hh-mm-ss'; // TODO it could be lighter. Make a MR or merge it directly and modify.
  import { getMessage } from "@/helpers";
  import type { TelemetryMessage } from '@/entry-points/content/AllMediaElementsController';
  import type { Settings } from "@/settings";
  import { tweened } from "svelte/motion";
  import { linear as EasingLinear } from "svelte/easing";

  type RequiredSettings = Pick<
    Settings,
    | "soundedSpeed"
    | "timeSavedAveragingMethod"
    | "timeSavedAveragingWindowLength"

    | "lifetimeTimeSavedComparedToSoundedSpeed"
    // These are not actually used, but let's keep them for consistency.
    | "lifetimeTimeSavedComparedToIntrinsicSpeed"
    | "lifetimeWouldHaveLastedIfSpeedWasSounded"
    | "lifetimeWouldHaveLastedIfSpeedWasIntrinsic"
  >;
  type RequiredTelemetry = Pick<
    TelemetryMessage,
    | 'elementRemainingIntrinsicDuration'

    | 'sessionTimeSaved'
    | 'lifetimeTimeSaved'
  >

  export let latestTelemetryRecord: RequiredTelemetry | undefined;
  export let settings: RequiredSettings;

  let generalTooltipContentEl: HTMLElement;

  function mmSs(s: number): string {
    return fromS(Math.round(s), 'mm:ss');
  }

  $: r = latestTelemetryRecord;
  $: s = latestTelemetryRecord?.sessionTimeSaved;
  $: timeSavedComparedToSoundedSpeedFraction = s != undefined
    ? s.timeSavedComparedToSoundedSpeed / (s.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)
    : undefined
  $: timeSavedComparedToSoundedSpeedPercent =
    (100 * (timeSavedComparedToSoundedSpeedFraction ?? 0)).toFixed(1) + '%';
  $: timeSavedComparedToSoundedSpeedAbs =
    mmSs(s?.timeSavedComparedToSoundedSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasSounded =
    mmSs(s?.wouldHaveLastedIfSpeedWasSounded ?? 0);
  $: timeSavedComparedToIntrinsicSpeedFraction = s != undefined
    ? s.timeSavedComparedToIntrinsicSpeed / (s.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)
    : undefined
  $: timeSavedComparedToIntrinsicSpeedPercent =
    (100 * (timeSavedComparedToIntrinsicSpeedFraction ?? 0)).toFixed(1) + '%';
  $: timeSavedComparedToIntrinsicSpeedAbs =
    mmSs(s?.timeSavedComparedToIntrinsicSpeed ?? 0);
  $: wouldHaveLastedIfSpeedWasIntrinsic =
    mmSs(s?.wouldHaveLastedIfSpeedWasIntrinsic ?? 0);

  let currLifetimeSavedVal: number | undefined =
    r?.lifetimeTimeSaved.timeSavedComparedToSoundedSpeed
  type NewVal = number;
  const tweenedLifetimeTimeSavedComparedToSoundedSpeed =
    tweened<number | undefined>(currLifetimeSavedVal, {
      easing: EasingLinear,

      // Increase at constant rate.
      // Most useful for seeking (cloning algorithm),
      // where we save time instantly.
      duration: (from, to) => {
        const diffMs = (
          (to as NewVal) -
          (from as NewVal)
        ) * 1000;
        // A 1:1 rate should be the easiest to feel, because it's real-time.
        //
        // Maybe we could make a setting out of this?
        const relativeRate = 1;

        // `Math.min` to make sure that we can keep up
        // with the rate of change. If we're saving a loooot of time,
        // then we speed up the tweening.
        return Math.min(
          diffMs / relativeRate,
          5_000,
        )
      },
      // Another fun way: increase the count at basically the average rate
      // of time saving.
      // It's pretty satisfying to see it slowly tick up, second by second.
      //
      // It, however, takes time to ramp it up after the initial render.
      // Maybe it's better to use the actual rate
      // based on "effective playback rate".
      //
      // And also it's perhaps not good, because the users will not see
      // that this "time saved" counter increases
      // only when we skip silence, as displayed on the chart.
      //
      // duration: 10_000,
    })
  $: if (r) {
    const newVal: NewVal = r.lifetimeTimeSaved.timeSavedComparedToSoundedSpeed
    const prevVal = currLifetimeSavedVal
    currLifetimeSavedVal = newVal
    if (newVal !== prevVal) {
      tweenedLifetimeTimeSavedComparedToSoundedSpeed.set(newVal)
    }
  }
  $: isTweenedLifetimeTimeSavedIncreasing =
    r != undefined
    && $tweenedLifetimeTimeSavedComparedToSoundedSpeed != undefined
    && $tweenedLifetimeTimeSavedComparedToSoundedSpeed <
      r.lifetimeTimeSaved.timeSavedComparedToSoundedSpeed

  function formatTimeSaved(num: number) {
    return num.toFixed(2);
  }
  const dummyTimeSavedValues = [
    1,
    1, // TODO use `getAbsoluteClampedSilenceSpeed`?
  ] as [number, number];
  function getTimeSavedPlaybackRateEquivalents(
    r: RequiredTelemetry['sessionTimeSaved'] | undefined
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
  $: timeSavedPlaybackRateEquivalents = getTimeSavedPlaybackRateEquivalents(s);
  $: timeSavedPlaybackRateEquivalentsFmt = [
    formatTimeSaved(timeSavedPlaybackRateEquivalents[0]),
    formatTimeSaved(timeSavedPlaybackRateEquivalents[1]),
  ] as const;
  $: timeSavedPlaybackRateEquivalentsAreDifferent =
    // Can't compare `timeSavedPlaybackRateEquivalents[0]` and `[1]` because due to rounding they can
    // jump between being the same and being different even if you don't change soundedSpeed.
    // Not simply doing a strict comparison (`!==`) because otherwise if you changed soundedSpeed for even
    // a moment, it would never stop showing both numbers.
    !beetween(
      1 / 1.02,
      (
        (s?.wouldHaveLastedIfSpeedWasSounded || Number.MIN_VALUE)
        / (s?.wouldHaveLastedIfSpeedWasIntrinsic || Number.MIN_VALUE)
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

<!-- <span>;</span> -->
<br>
<button
  type="button"
  use:tippy={{
    ...commonTippyProps,
    content: getMessage('timeSavedSinceInstallation')
  }}
>
  <span
    class="lifetime-time-saved"
    class:green={isTweenedLifetimeTimeSavedIncreasing}
  >{
    fromS(
      $tweenedLifetimeTimeSavedComparedToSoundedSpeed
        ?? settings.lifetimeTimeSavedComparedToSoundedSpeed,
      'mm:ss.sss'
      // The last digit is redundant probably.
    ).slice(0, -1)
  }</span>
</button>

<style>
  button {
    border: none;
    padding: 0;
    background: unset;
    font: inherit;
  }
  .lifetime-time-saved {
    transition-property: color, text-shadow;
    transition-timing-function: ease-out;
    transition-duration: 500ms, 15s;

    /* display: block;
    will-change: transform;
    font-weight: 900; */
  }
  .lifetime-time-saved.green {
    color: #b0ffb0;
    /* "Overheat" glow. */
    text-shadow:
      0px 0px 8px #b0ffb0,
      0px 0px 8px #b0ffb0;
    /* Almost instant change to green, but slower fade out to default color. */
    transition-duration: 10ms, 10s;

    /* Maybe this would be nice, but it causes ugly aliasing.
    Maybe changing the font would help, IDK. */
    /* transform: scale(1.1);
    transition-timing-function: (0.18, 0.89, 0.32, 1.28);
    transition-duration: 100ms; */
  }
  @media (prefers-color-scheme: light) {
    .lifetime-time-saved.green {
      color: #008000;
      text-shadow:
        0px 0px 8px #00FF0050;
    }
  }
</style>
