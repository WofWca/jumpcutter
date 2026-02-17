import type { PerTabOverrides } from '@/settings';
import type { FloatingPillUiState } from '@/core/messaging/contracts';

const DEFAULT_STATE: FloatingPillUiState = {
  x: 16,
  y: 90,
  open: false,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface FloatingPillOptions {
  initialOverrides: PerTabOverrides | null;
  initialState?: FloatingPillUiState;
  onOverridesChange: (overrides: PerTabOverrides | null) => void;
  onStateChange: (state: FloatingPillUiState) => void;
}

export interface FloatingPillController {
  destroy: () => void;
  updateOverrides: (overrides: PerTabOverrides | null) => void;
}

function withDefaults(overrides: PerTabOverrides | null) {
  return {
    enabled: overrides?.enabled ?? true,
    soundedSpeed: overrides?.soundedSpeed ?? 1.5,
    silenceSpeedRaw: overrides?.silenceSpeedRaw ?? 2.5,
    volumeThreshold: overrides?.volumeThreshold ?? 0.006,
  };
}

function fromStatefulValues(values: ReturnType<typeof withDefaults>): PerTabOverrides {
  return {
    enabled: values.enabled,
    soundedSpeed: values.soundedSpeed,
    silenceSpeedRaw: values.silenceSpeedRaw,
    volumeThreshold: values.volumeThreshold,
  };
}

export default function mountFloatingPill(options: FloatingPillOptions): FloatingPillController {
  const root = document.createElement('div');
  root.id = 'jump-cutter-floating-pill';
  root.style.position = 'fixed';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '2147483647';
  root.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.textContent = '⚡';
  pill.setAttribute('aria-label', 'Jump Cutter per-tab controls');
  pill.style.width = '42px';
  pill.style.height = '42px';
  pill.style.borderRadius = '999px';
  pill.style.border = '1px solid rgba(255,255,255,0.25)';
  pill.style.background = 'rgba(20,20,20,0.85)';
  pill.style.color = '#fff';
  pill.style.fontSize = '20px';
  pill.style.cursor = 'grab';
  pill.style.boxShadow = '0 6px 20px rgba(0,0,0,0.3)';
  pill.style.backdropFilter = 'blur(4px)';
  root.appendChild(pill);

  const panel = document.createElement('div');
  panel.style.position = 'absolute';
  panel.style.left = '48px';
  panel.style.top = '0';
  panel.style.width = '220px';
  panel.style.background = 'rgba(20,20,20,0.94)';
  panel.style.color = '#fff';
  panel.style.border = '1px solid rgba(255,255,255,0.15)';
  panel.style.borderRadius = '10px';
  panel.style.padding = '10px';
  panel.style.boxShadow = '0 12px 24px rgba(0,0,0,0.35)';
  panel.style.display = 'none';
  panel.style.fontSize = '12px';
  root.appendChild(panel);

  const state: FloatingPillUiState = { ...DEFAULT_STATE, ...(options.initialState || {}) };
  let overrideValues = withDefaults(options.initialOverrides);
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function emitState() {
    options.onStateChange({ ...state });
  }

  function renderPosition() {
    const maxX = Math.max(window.innerWidth - 52, 0);
    const maxY = Math.max(window.innerHeight - 52, 0);
    state.x = clamp(state.x, 0, maxX);
    state.y = clamp(state.y, 0, maxY);
    root.style.transform = `translate(${state.x}px, ${state.y}px)`;
    if (state.x > window.innerWidth - 280) {
      panel.style.left = '-228px';
    } else {
      panel.style.left = '48px';
    }
  }

  function renderPanel() {
    panel.innerHTML = '';
    panel.style.display = state.open ? 'block' : 'none';
    if (!state.open) {
      return;
    }

    const title = document.createElement('div');
    title.textContent = 'Per-tab controls';
    title.style.fontWeight = '700';
    title.style.marginBottom = '8px';
    panel.appendChild(title);

    const rows: Array<{
      label: string;
      type: 'checkbox' | 'range';
      min?: string;
      max?: string;
      step?: string;
      value: string | boolean;
      onInput: (next: string | boolean) => void;
    }> = [
      {
        label: 'Enabled',
        type: 'checkbox',
        value: overrideValues.enabled,
        onInput: (next) => {
          overrideValues.enabled = Boolean(next);
        },
      },
      {
        label: 'Sounded speed',
        type: 'range',
        min: '0.25',
        max: '4',
        step: '0.05',
        value: String(overrideValues.soundedSpeed),
        onInput: (next) => {
          overrideValues.soundedSpeed = Number(next);
        },
      },
      {
        label: 'Silence speed',
        type: 'range',
        min: '1',
        max: '8',
        step: '0.05',
        value: String(overrideValues.silenceSpeedRaw),
        onInput: (next) => {
          overrideValues.silenceSpeedRaw = Number(next);
        },
      },
      {
        label: 'Volume threshold',
        type: 'range',
        min: '0',
        max: '0.05',
        step: '0.0001',
        value: String(overrideValues.volumeThreshold),
        onInput: (next) => {
          overrideValues.volumeThreshold = Number(next);
        },
      },
    ];

    for (const row of rows) {
      const wrap = document.createElement('label');
      wrap.style.display = 'grid';
      wrap.style.gridTemplateColumns = '1fr auto';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';
      wrap.style.marginBottom = '6px';
      wrap.textContent = row.label;

      const input = document.createElement('input');
      input.type = row.type;
      if (row.type === 'checkbox') {
        input.checked = Boolean(row.value);
      } else {
        if (row.min) input.min = row.min;
        if (row.max) input.max = row.max;
        if (row.step) input.step = row.step;
        input.value = String(row.value);
        input.style.width = '110px';
      }
      input.addEventListener('input', () => {
        row.onInput(row.type === 'checkbox' ? input.checked : input.value);
        options.onOverridesChange(fromStatefulValues(overrideValues));
        if (row.type === 'range') {
          valueText.textContent = Number(input.value).toFixed(row.label === 'Volume threshold' ? 4 : 2);
        }
      });
      wrap.appendChild(input);

      const valueText = document.createElement('span');
      if (row.type === 'range') {
        valueText.textContent = Number(String(row.value)).toFixed(row.label === 'Volume threshold' ? 4 : 2);
      } else {
        valueText.textContent = '';
      }
      valueText.style.opacity = '0.8';
      valueText.style.fontVariantNumeric = 'tabular-nums';
      wrap.appendChild(valueText);
      panel.appendChild(wrap);
    }
  }

  pill.addEventListener('click', (event) => {
    if (dragging) {
      return;
    }
    if ((event as MouseEvent).detail === 2) {
      return;
    }
    state.open = !state.open;
    renderPanel();
    emitState();
  });

  pill.addEventListener('wheel', event => {
    event.preventDefault();
    const delta = Math.sign(event.deltaY) * -0.1;
    overrideValues.soundedSpeed = clamp(Number((overrideValues.soundedSpeed + delta).toFixed(2)), 0.25, 4);
    options.onOverridesChange(fromStatefulValues(overrideValues));
    renderPanel();
  }, { passive: false });

  pill.addEventListener('pointerdown', event => {
    dragging = false;
    dragOffsetX = event.clientX - state.x;
    dragOffsetY = event.clientY - state.y;
    pill.style.cursor = 'grabbing';
    pill.setPointerCapture(event.pointerId);
  });
  pill.addEventListener('pointermove', event => {
    if (!pill.hasPointerCapture(event.pointerId)) {
      return;
    }
    dragging = true;
    state.x = event.clientX - dragOffsetX;
    state.y = event.clientY - dragOffsetY;
    renderPosition();
  });
  pill.addEventListener('pointerup', event => {
    pill.style.cursor = 'grab';
    if (pill.hasPointerCapture(event.pointerId)) {
      pill.releasePointerCapture(event.pointerId);
    }
    emitState();
    setTimeout(() => {
      dragging = false;
    }, 0);
  });

  window.addEventListener('resize', renderPosition);
  renderPosition();
  renderPanel();
  document.documentElement.appendChild(root);

  return {
    destroy: () => {
      window.removeEventListener('resize', renderPosition);
      root.remove();
    },
    updateOverrides: (overrides) => {
      overrideValues = withDefaults(overrides);
      renderPanel();
    },
  };
}
