# <img src="./src/icons/icon.svg" alt="Logo" height="32"/> Jump Cutter

[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/lmppdpldfpfdlipofacekcfleacbbncp?logo=google-chrome)][chrome-web-store]
[![Firefox Browser Add-ons](https://img.shields.io/amo/users/jump-cutter?logo=firefox-browser)][addons-mozilla-org]
[![Discord](https://img.shields.io/discord/678444692592918548?logo=discord)](https://discord.gg/HCjghyT)
[![Translation status](https://hosted.weblate.org/widgets/jump-cutter/-/svg-badge.svg)][weblate]

[![Chrome Web Store](docs/extension-store-badges/chrome.png)][chrome-web-store]
[![Firefox Browser Add-ons](docs/extension-store-badges/mozilla.svg)][addons-mozilla-org]

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

* [🌐 Translate](weblate)

* [💸 Donate](#donate)

## Build

1. Install base tools:
    * [Node.js](https://nodejs.org/).
    * [Yarn v1](https://classic.yarnpkg.com/docs/install).
2. Run

    ```bash
    yarn install
    ```

3.
    * To build for Gecko (e.g. Firefox):

    ```bash
    yarn build:gecko
    ```

    * To build for Chromium (e.g. Chrome)

    ```bash
    yarn build:chromium
    ```

    Bundled files will appear in `./dist`.

## Donate

* <bitcoin:bc1qdfz74882mlk64pj4ctpdegvxv9r7jgq8xs2qkxpv3gkv5xqygvgs0fyzm9>
* https://liberapay.com/WofWca

[addons-mozilla-org]: https://addons.mozilla.org/firefox/addon/jump-cutter
[chrome-web-store]: https://chrome.google.com/webstore/detail/jump-cutter/lmppdpldfpfdlipofacekcfleacbbncp
[weblate]: https://hosted.weblate.org/engage/jump-cutter/
