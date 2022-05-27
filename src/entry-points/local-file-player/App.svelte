<!--
Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>

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
  import { tick, onMount } from 'svelte';
  // TODO get rid of svelte?
  import { getMessage } from '@/helpers';

  const defaultDocumentTitle = 'Jump Cutter: local video player'; // TODO translate?
  document.title = defaultDocumentTitle;

  type HTMLInputElementTypeFile = HTMLInputElement & { files: NonNullable<HTMLInputElement['files']> };
  let inputEl: HTMLInputElementTypeFile;
  let videoEl: HTMLVideoElement;
  let objectURL: ReturnType<typeof URL.createObjectURL> | undefined;

  let numFiles = 0;
  let currFileInd: number;
  // Need this because Svelte's reactivity doesn't appear to work properly with `FileList`.
  let files: File[] = [];
  async function onInputChange() {
    files = [];

    numFiles = inputEl.files.length;
    if (numFiles <= 0) {
      // In case it was un-selected (I think that's the only case when it can happen).
      document.title = defaultDocumentTitle;
      return;
    }

    for (const file of inputEl.files) {
      files.push(file);
    }

    playFile(0);
  }
  async function playFile(ind: number) {
    currFileInd = ind;
    const file = inputEl.files[ind];
    // TODO handle `!video.canPlayType(file.type)`?
    document.title = file.name + ' – Jump Cutter';
    // For better performance. https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL#Memory_management
    objectURL && URL.revokeObjectURL(objectURL);
    objectURL = URL.createObjectURL(file);
    // TODO make the dimensions of the video element not jump when switching between videos.
    videoEl.src = objectURL;
    videoEl.play();
    await tick(); // Because initially it's `display: none;`.
    videoEl.focus();
  }

  onMount(() => {
    videoEl.addEventListener('ended', async () => {
      // TODO `if (loop)` `const nextFileInd = (currFileInd + 1) % inputEl.files.length;`
      const nextFileInd = currFileInd + 1;
      if (nextFileInd < inputEl.files.length) {
        // TODO `if (autoplay)`
        playFile(nextFileInd);
      }
    }, { passive: true });
  });

</script>

<!-- TODO but can we add a way to add captions? -->
<!-- svelte-ignore a11y-media-has-caption -->
<div class="video-and-file-input">
  <div
    style="display: flex; flex-wrap: wrap;"
  >
    <video
      bind:this={videoEl}
      controls
      style={objectURL ? '' : 'display: none; '}
    />
    <!-- <label>
      <input
        type="checkbox"
      />
      Autoplay
    </label> -->

    {#if files.length > 1}
      <ol class="playlist">
        <!-- {#each inputEl?.files ?? [] as file, ind} -->
        {#each files as file, ind}
          <li>
            <button
              on:click={() => playFile(ind)}
              disabled={ind === currFileInd}
            >
              {file.name}
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
  <div class="video-input-wrapper">
    <input
      bind:this={inputEl}
      on:change={onInputChange}
      id="video-input"
      type="file"
      accept="video/*,audio/*"
      multiple
    />
    <div class="input-box-content">
      <p style="text-align: center; margin: 1rem; white-space: pre-line;">{getMessage('fileInputLabel')}</p>
    </div>
  </div>
</div>
<style>
  @media (prefers-color-scheme: dark) {
    :global(body) {
      background: #222;
      color: #ddd;
    }
  }

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

  .playlist {
    padding-left: 1rem;
    margin: var(--common-margin);
    margin-top: 0;
  }
  .playlist > li {
    margin: 0.25rem;
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
  @media (prefers-color-scheme: dark) {
    .input-box-content {
      color: #aaa;
      background:rgba(0, 255, 0, 0.2);
      border-color: #111;
    }
  }
</style>
