# Migration

### Notes
- removed from manifest:
```
"browser_specific_settings": {
"gecko": {
"id": "jump-cutter@example.com",
"strict_min_version": "91.0a1"
}
},
```
since it shows an unnecessary warning on chromium.

- The service worker can't use import(), so web-pack needs to be changed somehow to bundle all the service worker files to common JS.

- There is some problem when setting the icon in the service worker:
```
Uncaught (in promise) Error: Failed to set icon '/icons/icon.svg': The source image could not be decoded.
```
I tried with a png image and it did not happen, so the solution would be replacing for pngs those 3 images. Check if there is some note in the api about svg problems and solutions in  case you want to use svgs.

### Chrome manifest migration checklist

- [x] Manifest initial changes:
   - [x] update version number
   - [x] update host permisions: there were nothing to update
   - [x] update web accesibles resources: now they require to specify urls they can be accesed from, for now i allowed all urls.

- [ ] replace background script for a service worker
   - [x] Update the "background" field in the manifest
   - [x] Move DOM and window calls to an offscreen document
   - [x] Convert localStorage to another type
   - [x] Register listeners synchronously
   - [x] Replace XMLHttpRequest() with global fetch()
   - [ ] Persist state
   - [ ] Convert timers to alarms: There is 2 timeouts used, but they are instant, so perhaps there is not need to replace them with alarms?
   There is also another setTimeout that has to be replaced at iconAndBadgeUpdater.ts line 62.  
   - [ ] Keep the service worker alive: Not sure if there is a need to keep the service worker alive.

- [ ] Update your code
   - [x] Replace tabs.executeScript() with scripting.executeScript()
   - [x] Replace tabs.insertCSS() and tabs.removeCSS() with scripting.insertCSS() and scripting.removeCSS()
   - [x] Replace Browser Actions and Page Actions with Actions
   - [x] Replace `browser_action` and `page_action` with "action" in manifest
   - [x] Replace the browserAction and pageAction APIs with the action API
   - [ ] Replace callbacks with promises
   - [x] Replace functions that expect a Manifest V2 background context
   - [x] Replace unsupported APIs

- [x] Replace blocking web request listeners: Not used in the extension

- [x] Improve extension security
   - [x] Remove execution of arbitrary strings: there is no use of executeScript(), eval(), and new Function().
   - [x] Remove remotely hosted code: aparently there is not remotely hosted code.
   - [x] Update the content security policy: There was not content security policy in the manifest so there is nothing to update, i guess there is not need to add it.
   - [x] Remove unsupported content security policy values: there is no content security policy, so there is nothing to remove.
