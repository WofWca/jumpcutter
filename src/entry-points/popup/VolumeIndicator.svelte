<script lang="ts">
  import { tippyActionAsyncPreload as tippy } from "./tippyAction";
  import { getMessage } from "@/helpers";
  import { TelemetryMessage } from "../content/AllMediaElementsController";
  import {
    HotkeyAction_INCREASE_VOLUME,
    HotkeyAction_DECREASE_VOLUME,
  } from "@/hotkeys";

  const tippyThemeMyTippyAndPreLine = "my-tippy white-space-pre-line";

  export let getActionString: Function;
  export let latestTelemetryRecord: TelemetryMessage | undefined;
</script>

<!-- TODO work on accessibility for the volume indicator. https://atomiks.github.io/tippyjs/v6/accessibility. -->
<span
  use:tippy={{
    content: () => {
      let tooltip = getMessage("volume");
      const hotkeysString =
        getActionString(
          HotkeyAction_INCREASE_VOLUME,
          getMessage("increaseSettingValue"),
        ) +
        getActionString(
          HotkeyAction_DECREASE_VOLUME,
          getMessage("decreaseSettingValue"),
        );
      if (hotkeysString) {
        tooltip += "\n" + hotkeysString;
      }

      return tooltip;
    },
    theme: tippyThemeMyTippyAndPreLine,
  }}
>
  <!-- `min-width` because the emojis have different widths, so it remains constant. -->
  <span style="display: inline-block; min-width: 2.5ch;"
    >{(() => {
      if (!latestTelemetryRecord) return "🔉";
      const vol = latestTelemetryRecord.elementVolume;
      if (vol < 0.001) return "🔇";
      if (vol < 1 / 3) return "🔈";
      if (vol < 2 / 3) return "🔉";
      return "🔊";
    })()}</span
  >
  <!-- TODO how about we replace it with a range input. -->
  <meter
    min="0"
    max="1"
    value={latestTelemetryRecord?.elementVolume ?? 0}
    style="width: 6rem;"
  ></meter>
</span>
