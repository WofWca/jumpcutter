document.addEventListener('DOMContentLoaded', function () {
  const volumeThresholdEl = document.getElementById('volumeThreshold');
  const silenceSpeedEl = document.getElementById('silenceSpeed');
  const soundedSpeedEl = document.getElementById('soundedSpeed');
  const enabledEl = document.getElementById('enabled');

  chrome.storage.sync.get(
    {
      volumeThreshold: 0.01,
      silenceSpeed: 4,
      soundedSpeed: 1.75,
      enabled: true,
    },
    function ({ volumeThreshold, silenceSpeed, soundedSpeed, enabled }) {
      volumeThresholdEl.value = volumeThreshold;
      silenceSpeedEl.value = silenceSpeed;
      soundedSpeedEl.value = soundedSpeed;
      enabledEl.checked = enabled;
    }
  );

  function saveSettings() {
    chrome.storage.sync.set({
      volumeThreshold: volumeThresholdEl.value,
      silenceSpeed: silenceSpeedEl.value,
      soundedSpeed: soundedSpeedEl.value,
      enabled: enabledEl.checked,
    });
  }
  let saveSettingsDebounceTimeout = -1;
  function debounceSaveSettings() {
    clearTimeout(saveSettingsDebounceTimeout);
    // TODO make sure settings are saved when the popup is closed.
    saveSettingsDebounceTimeout = setTimeout(saveSettings, 200);
  }
  [volumeThresholdEl, silenceSpeedEl, soundedSpeedEl].forEach(el => {
    el.addEventListener('input', debounceSaveSettings);
  });
  enabledEl.addEventListener('input', saveSettings);
});
