document.addEventListener('DOMContentLoaded', function () {
  /**
   * @param {Event} e
   */
  document.getElementById('resetSoundedSpeed').onclick = function onResetSoundedSpeedClick(e) {
    const input = document.getElementById('soundedSpeed');
    input.value = 1.1;
    input.dispatchEvent(new Event('input'));
  }

  const enabledEl = document.getElementById('enabled');
  const numberInputsNames = [
    'volumeThreshold',
    'silenceSpeed',
    'soundedSpeed',
    'marginBefore',
    // 'marginAfter'
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
      marginBefore: 0.050,
      marginAfter: 0.050,
    },
    function (settings) {
      Object.entries(numberInputs).forEach(([name, el]) => {
        el.value = settings[name];
      });
      enabledEl.checked = enabled;

      /**
       * @param {InputEvent} e
       */
      function updateRangeNumberRepresentation(el) {
        el.nextElementSibling.innerText = parseFloat(el.value).toFixed(3);
      }
      document.querySelectorAll('input[type="range"]').forEach(el => {
        updateRangeNumberRepresentation(el);
        el.addEventListener('input', e => updateRangeNumberRepresentation(e.target));
      });
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
