# Migration

### Notes
removed from manifest:
```
"browser_specific_settings": {
    "gecko": {
      "id": "jump-cutter@example.com",
      "strict_min_version": "91.0a1"
    }
  },
```
since it shows an unnecessary warning on chromium.

### Chrome manifest migration checklist

[x] Manifest initial changes:
    [x] update version number
    [x] update host permisions: there were nothing to update
    [x] update web accesibles resources: now they require to specify urls they can be accesed from, for now i allowed all urls.
