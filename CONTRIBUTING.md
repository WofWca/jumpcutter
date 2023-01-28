# Contributing

This doc is about code contributions. For other ways to help, see [README](./README.md#contribute).

## Development setup

Usually it goes like this:

### 1. Set up the environment

Follow the steps in [README.md#build](./README.md#build), until the `yarn build` part.

### 2. Build (for development)

<!-- TODO refactor: this seems to be duplicating the README a little. -->
If you're gonna be testing your changes in a Chromium-based browser, run `yarn serve:chromium`. For Gecko-based browsers it's `yarn serve:gecko`. The built files will appear in `./dist-chromium` (or `./dist-gecko`), and will update as you make changes to the code.

### 3. Load the extension into the browser

Follow these instructions:

* [Chromium](https://developer.chrome.com/docs/extensions/mv3/getstarted/#unpacked)
* [Gecko](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing)

Now it should be working, like you just installed it from a store.

Don't forget to click the "__reload extension__" button in the browser after you make changes in order for them to take effect.
For content scripts, also __reload the page__ you're testing it on.

### 4. Debug

You can open browser dev tools for each script (background, popup, content) of the extension:

* [Chromium](https://developer.chrome.com/docs/extensions/mv3/tut_debugging/)
* [Gecko](https://firefox-source-docs.mozilla.org/devtools-user/about_colon_debugging/index.html#installed-extensions)

## Closing points

I encourage you to [be bold](https://en.wikipedia.org/wiki/Wikipedia:Be_bold) when making changes.

And as always, reach out to me if you have any problems!
