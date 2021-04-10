# <img src="./src/icons/icon.svg" alt="Logo" height="32"/> Jump Cutter

[![Chrome Web Store](https://img.shields.io/chrome-web-store/users/lmppdpldfpfdlipofacekcfleacbbncp?logo=google-chrome)](https://chrome.google.com/webstore/detail/jump-cutter/lmppdpldfpfdlipofacekcfleacbbncp)
[![Firefox Browser Add-ons](https://img.shields.io/amo/users/jump-cutter?logo=firefox-browser)](https://addons.mozilla.org/firefox/addon/jump-cutter)
[![Discord](https://img.shields.io/discord/678444692592918548?logo=discord)](https://discord.gg/HCjghyT)

Plays silent parts of videos on the page at faster speed.
Can be useful for watching lectures and other unedited videos.

![Extension popup screenshot](./screenshots/popup-1280x800.png)

Inspired by [this video](https://youtu.be/DQ8orIurGxw) by carykh.

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
