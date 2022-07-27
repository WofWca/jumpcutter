1. Pull `src/_locales` from the Weblate repo, commit `.gitmodules`.
2. Add new contributors to `src/_locales/LICENSE_NOTICES`. To make sure you didn't miss anyone, check if `git shortlog --summary --email | wc -l` outputs a number that is 1 smaller than the number of lines in the coppyright notice (to account for Anonymous).
3. Bump version in `src/manifest.json`
4. Publish
    * Chrome Web Store

      Nothing special currently

    * Mozilla Add-ons

      If new locales were added, or if there were changes to the extension description string, update the description in the store.

    * Microsoft Edge Addons

      Same as for Mozilla Add-ons + copy the icon for all languages.

    * Other

      We don't currently localize the full description, but if we start doing this, then we'll also need to update it, in Chrome Web Store as well.
