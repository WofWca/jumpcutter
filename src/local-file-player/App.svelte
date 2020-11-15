<script lang="ts">
  import { tick } from 'svelte';
  // TODO get rid of svelte?
  const defaultDocumentTitle = 'Jump Cutter: local video player';
  document.title = defaultDocumentTitle;

  let inputEl: HTMLInputElement;
  let videoEl: HTMLVideoElement;
  let objectURL: ReturnType<typeof URL.createObjectURL> | undefined;
  async function onInputChange() {
    const file = inputEl.files?.[0];
    if (!file) {
      // In case it was un-selected (I think that's the only case when it can happen).
      document.title = defaultDocumentTitle;
      return;
    }
    // TODO handle `!video.canPlayType(file.type)`?
    document.title = file.name + ' – Jump Cutter';
    // For better performance. https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL#Memory_management
    objectURL && URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file);
    const savedSpeed = videoEl.playbackRate;
    videoEl.src = objectURL;
    videoEl.playbackRate = savedSpeed; // Because apparently it's reset after `src` is changed.
    videoEl.play();
    await tick(); // Because initially it's `display: none;`.
    videoEl.focus();
  }

</script>

<!-- TODO but can we add a way to add captions? -->
<!-- svelte-ignore a11y-media-has-caption -->
<div class="video-and-file-input">
  <div>
    <video
      bind:this={videoEl}
      controls
      style={objectURL ? '' : 'display: none; '}
    />
  </div>
  <div class="video-input-wrapper">
    <input
      bind:this={inputEl}
      on:change={onInputChange}
      id="video-input"
      type="file"
      accept="video/*,audio/*"
    />
    <div class="input-box-content">
      <p style="text-align: center; margin: 1rem;">Drop a file here<br>or click to select</p>
    </div>
  </div>
</div>
<style>
  .video-and-file-input {
    --common-margin: 0.5rem;
    margin: var(--common-margin);
    min-height: calc(100vh - 2 * var(--common-margin));
    display: flex;
    flex-direction: column;
  }

  video {
    max-height: calc(100vh - 2 * var(--common-margin));
    margin-bottom: var(--common-margin);
    max-width: 100%;
  }

  .video-input-wrapper {
    position: relative;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
  }

  /* The input has `opacity: 0`, so this is to replicate its behavior. */
  .video-input-wrapper:focus-within {
    outline: auto;
  }

  #video-input {
    /* height: 64rem; */
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
  }

  .input-box-content {
    flex-grow: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 3rem;
    color: #555;
    background:rgba(0, 255, 0, 0.3);
    border: 0.25rem dashed gray;
  }
</style>
