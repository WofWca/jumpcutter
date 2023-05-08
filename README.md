# <img src="./src/icons/icon.svg" alt="Logo" height="32"/> Jump Cutter

[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/lmppdpldfpfdlipofacekcfleacbbncp?logo=google-chrome)][chrome-web-store]
[![Firefox Browser Add-ons](https://img.shields.io/amo/users/jump-cutter?logo=firefox-browser)][addons-mozilla-org] <!-- [![Liberapay](https://img.shields.io/liberapay/receives/WofWca?logo=liberapay)](https://liberapay.com/WofWca) --> [![Matrix](https://img.shields.io/matrix/jump-cutter-extension:matrix.org?logo=matrix&server_fqdn=matrix.org)](https://matrix.to/#/#jump-cutter-extension:matrix.org)
[![Discord](https://img.shields.io/discord/678444692592918548?logo=discord)](https://discord.gg/HCjghyT)
[![Translation status](https://hosted.weblate.org/widgets/jump-cutter/-/svg-badge.svg)][weblate]

Download:

[![Chrome Web Store](docs/extension-store-badges/chrome.png)][chrome-web-store]
[![Firefox Browser Add-ons](docs/extension-store-badges/mozilla.svg)][addons-mozilla-org]
[![Microsoft Edge Add-ons](docs/extension-store-badges/microsoft.svg)][microsoft-edge-addons]
or from GitHub: [Chromium](https://github.com/WofWca/jumpcutter/releases/latest/download/lmppdpldfpfdlipofacekcfleacbbncp_main.crx
) / [Gecko (Firefox)](https://github.com/WofWca/jumpcutter/releases/latest/download/jump_cutter.xpi)

Skips silent parts in videos, in real time.

Can be useful for watching lectures, stream recordings (VODs), webinars, podcasts, and other unedited videos.

Demo:

<!-- TODO refactor: put the file in the repo so it's set in stone? -->
<!-- The source video:
https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-034-artificial-intelligence-fall-2010/lecture-videos/lecture-16-learning-support-vector-machines/
(or https://youtu.be/_PwhiWxHK8o).
This video's license: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/).
Not sure if I did comply with the license here.
But I believe this use case would be considered "fair use" anyway.
 -->
<https://user-images.githubusercontent.com/39462442/131825020-5308b879-0509-41a3-95c9-bb4ad8938dc0.mp4>

Inspired by [this video](https://youtu.be/DQ8orIurGxw) by carykh.

<!-- FYI this section is linked from CONTRIBUTING.md -->
## Contribute

* [🌐 Translate (on Weblate)][weblate]
* 👨‍💻 Code. See [CONTRIBUTING.md](./CONTRIBUTING.md) on how to get started. And feel free to contact me.
* [💸 Donate](#donate)
* General feedback and questioning my decisions is appreciated

## How it works

Simple (mostly).

Currently there are 2 separate algorithms in place.

The first one we call "the stretching algorithm", and it's in [this file](./src/entry-points/content/ElementPlaybackControllerStretching/ElementPlaybackControllerStretching.ts). It simply looks at the output audio of a media element, determines its current loudness and, when it's not loud, increases its `playbackRate`.

<details><summary>Details, why it's called "stretching"</summary>
It's about how we're able to "look ahead" and slow down shortly before a loud part ("Margin before"). Basically we slightly delay the audio from it before outputting it. When we encounter a loud part, we slow down (stretch and pitch-shift) the buffered audio so that it appears to have been played at normal speed, then output it.

You can check out the comments in its source code for more details.
</details>

The second one is "the cloning algorithm", and it's [here](./src/entry-points/content/ElementPlaybackControllerCloning/ElementPlaybackControllerCloning.ts). It creates a hidden clone of the target media element and plays it ahead of the original one, looking for silent parts and writing down where they are. When the target element reaches that part,
we increase its `playbackRate`, or skip (seek) it entirely.
Currently you can enable it by checking the "Use the experimental algorithm" checkbox.

<!-- FYI this section is linked from CONTRIBUTING.md -->
## Build

1. Install base tools:
    * [Node.js](https://nodejs.org/).
    * [Yarn v1](https://classic.yarnpkg.com/docs/install).
2. Run

    ```bash
    yarn install
    ```

3.
    Fill the `src/_locales` directory with localization files. Skip this step if they're alredy there. Either:

    * If you're using `git`:

        `git submodule update --init`

    * If you don't want to use `git`, download them from the `translations` branch and put in `src/_locales` manually.

4.
    * To build for Gecko (e.g. Firefox):

        ```bash
        yarn build:gecko
        ```

    * To build for Chromium (e.g. Chrome, Edge)

        ```bash
        yarn build:chromium
        ```

    Bundled files will appear in `./dist-gecko` (or `./dist-chromium`).

For development build, see [CONTRIBUTING.md](./CONTRIBUTING.md)

Then you can install it on the extensions management page of your browser ([Chromium](https://developer.chrome.com/docs/extensions/mv3/getstarted/#unpacked), [Gecko](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)).

## Privacy & security

In short: it's fine.

As with practically every other extension, websites you're visiting _may_ detect that you're using this (or alike) extension, and your settings for the extension, by observing:

* playback rate changes of an element.
* the fact that `createMediaElementSource` has been called for an element.
* increased frequency of media chunk requests resulting from increased playback rate. This cannot be mitigated with disabling JavaScript.
* the fact of requesting the same media twice, as a result of using the cloning algotihm.

However I doubt that currently there are services that do specifically this. But there may be.

Other than that, there are no known things concerning this. It doesn't interact with third parties or try to do other creepy stuff.

## Donate

* <https://antiwarcommittee.info/en/sunrise/#help>
* Monero (XMR):

  > <monero:88yzE5FbDoMVLXUXkbJXVHjNpP5S3xkMaTwBSxmetBDvQMbecMtVCXnQ44W6WRYsPGCPoAYp74ER9aDgBLYDGAAiSt2wu8a?tx_amount=0.050000000000&recipient_name=WofWca%20(https%3A//github.com/WofWca)&tx_description=Donation%20for%20Jump%20Cutter%20extension%20development>
* Bitcoin (BTC):

  > <bitcoin:bc1qdfz74882mlk64pj4ctpdegvxv9r7jgq8xs2qkxpv3gkv5xqygvgs0fyzm9>
<!-- * <https://liberapay.com/WofWca> -->

<br>
<br>
<br>

[![AGPLv3 Logo](docs/agplv3-with-text-162x68.png)](./COPYING)

[addons-mozilla-org]: https://addons.mozilla.org/firefox/addon/jump-cutter
[chrome-web-store]: https://chrome.google.com/webstore/detail/jump-cutter/lmppdpldfpfdlipofacekcfleacbbncp
[microsoft-edge-addons]: https://microsoftedge.microsoft.com/addons/detail/jlbjhoaphnkkjdafpjomedllppldjkbj
[weblate]: https://hosted.weblate.org/engage/jump-cutter/
