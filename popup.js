document.addEventListener('DOMContentLoaded', function () {
  const volumeThresholdEl = document.getElementById('volumeThreshold');
  const silenceSpeedEl = document.getElementById('silenceSpeed');
  const soundedSpeedEl = document.getElementById('soundedSpeed');
  const allInputs = [volumeThresholdEl, silenceSpeedEl, soundedSpeedEl];

  chrome.storage.sync.get(
    {
      volumeThreshold: 0.01,
      silenceSpeed: 4,
      soundedSpeed: 1.75,
    },
    function ({ volumeThreshold, silenceSpeed, soundedSpeed }) {
      volumeThresholdEl.value = volumeThreshold;
      silenceSpeedEl.value = silenceSpeed;
      soundedSpeedEl.value = soundedSpeed;
    }
  );

  function saveSettings() {
    chrome.storage.sync.set({
      volumeThreshold: volumeThresholdEl.value,
      silenceSpeed: silenceSpeedEl.value,
      soundedSpeed: soundedSpeedEl.value,
    });
  }
  let saveSettingsDebounceTimeout = -1;
  function debounceSaveSettings() {
    clearTimeout(saveSettingsDebounceTimeout);
    // TODO make sure settings are saved when the popup is closed.
    saveSettingsDebounceTimeout = setTimeout(saveSettings, 200);
  }
  allInputs.forEach(el => {
    el.addEventListener('input', function () {
      debounceSaveSettings();
    });
  });
});
