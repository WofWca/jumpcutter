document.addEventListener('DOMContentLoaded', function () {
  const enabledEl = document.getElementById('enabled');
  const numberInputsNames = [
    'volumeThreshold',
    'silenceSpeed',
    'soundedSpeed',
  ];
  const numberInputs = {};
  numberInputsNames.forEach(n => {
    numberInputs[n] = document.getElementById(n)
  });

  chrome.storage.sync.get(
    {
      enabled: true,
      volumeThreshold: 0.01,
      silenceSpeed: 4,
      soundedSpeed: 1.75,
    },
    function (settings) {
      Object.entries(numberInputs).forEach(([name, el]) => {
        el.value = settings[name];
      });
      enabledEl.checked = enabled;
    }
  );

  function saveSettings() {
    const newSettings = {
      enabled: enabledEl.checked,
    };
    Object.entries(numberInputs).forEach(([name, el]) => {
      newSettings[name] = parseFloat(el.value);
    });
    chrome.storage.sync.set(newSettings);
  }
  let saveSettingsDebounceTimeout = -1;
  function debounceSaveSettings() {
    clearTimeout(saveSettingsDebounceTimeout);
    // TODO make sure settings are saved when the popup is closed.
    saveSettingsDebounceTimeout = setTimeout(saveSettings, 200);
  }
  enabledEl.addEventListener('input', saveSettings);
  Object.values(numberInputs).forEach(el => {
    el.addEventListener('input', debounceSaveSettings);
  });
});
