# <img src="./src/icons/icon.svg" alt="Logo" height="32"/> Jump Cutter

[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/lmppdpldfpfdlipofacekcfleacbbncp?logo=google-chrome)][chrome-web-store]
[![Firefox Browser Add-ons](https://img.shields.io/amo/users/jump-cutter?logo=firefox-browser)][addons-mozilla-org]
[![Liberapay](https://img.shields.io/liberapay/receives/WofWca?logo=liberapay)](https://liberapay.com/WofWca)
[![Discord](https://img.shields.io/discord/678444692592918548?logo=discord)](https://discord.gg/HCjghyT)
[![Translation status](https://hosted.weblate.org/widgets/jump-cutter/-/svg-badge.svg)][weblate]

[![Chrome Web Store](docs/extension-store-badges/chrome.png)][chrome-web-store]
[![Firefox Browser Add-ons](docs/extension-store-badges/mozilla.svg)][addons-mozilla-org]
[![Microsoft Edge Add-ons](docs/extension-store-badges/microsoft.svg)][microsoft-edge-addons]

Skips silent parts in videos, in real time.

Can be useful for watching lectures and other unedited videos.

Demo:

<!-- TODO put the file in the repo so it's set in stone? -->
<!-- The source video:
https://ocw.mit.edu/courses/electrical-engineering-and-computer-science/6-034-artificial-intelligence-fall-2010/lecture-videos/lecture-16-learning-support-vector-machines/
(or https://youtu.be/_PwhiWxHK8o).
This video's license: CC BY-NC-SA 4.0 (https://creativecommons.org/licenses/by-nc-sa/4.0/).
Not sure if I did comply with the license here.
But I believe this use case would be considered "fair use" anyway.
 -->
<https://user-images.githubusercontent.com/39462442/131825020-5308b879-0509-41a3-95c9-bb4ad8938dc0.mp4>

Inspired by [this video](https://youtu.be/DQ8orIurGxw) by carykh.

## Contribute

* [🌐 Translate (on Weblate)][weblate]
* 👨‍💻 Code contributions are welcome, but I have not decided on the license yet, so if you don't mind submitting your changes under the [CC0](https://creativecommons.org/publicdomain/zero/1.0/) license, please do. Feel free to contact me.
* [💸 Donate](#donate)
* General feedback and questioning my decisions is appreciated

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

    * To build for Chromium (e.g. Chrome)

        ```bash
        yarn build:chromium
        ```

    Bundled files will appear in `./dist`.

Then you can install it on the extensions management page of your browser ([Chromium](https://developer.chrome.com/docs/extensions/mv3/getstarted/#unpacked), [Gecko](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)).

## Privacy & security

In short: it's fine.

As with practically every other extension, websites you're visiting _may_ detect that you're using this (or alike) extension, and your settings for the extension, by observing:

* playback rate changes of an element.
* the fact that `createMediaElementSource` has been called for an element.
* increased frequency of media chunk requests resulting from increased playback rate. This cannot be mitigated with disabling JavaScript.
* the fact of requesting the same media twice, as a result of using the cloning algotihm.

However I doubt that currently there are services that do specifically this. But there may be.

Other than that, there are no known things concerning this.

## Donate

* <bitcoin:bc1qdfz74882mlk64pj4ctpdegvxv9r7jgq8xs2qkxpv3gkv5xqygvgs0fyzm9>
* <https://liberapay.com/WofWca>

[addons-mozilla-org]: https://addons.mozilla.org/firefox/addon/jump-cutter
[chrome-web-store]: https://chrome.google.com/webstore/detail/jump-cutter/lmppdpldfpfdlipofacekcfleacbbncp
[microsoft-edge-addons]: https://microsoftedge.microsoft.com/addons/detail/jlbjhoaphnkkjdafpjomedllppldjkbj
[weblate]: https://hosted.weblate.org/engage/jump-cutter/
