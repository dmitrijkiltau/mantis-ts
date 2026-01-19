import { renderBubbleContent } from './bubble/render-bubble';
import { UIState } from './ui-state';

const IDLE_MIN_MS = 45000;
const SMALLTALK_COOLDOWN_MS = 120000;
const SMALLTALK_CHECK_MS = 12000;

const SMALLTALK_LINES = [
  'System check: all green. Awaiting your next directive.',
  'Diagnostics are clean. Monitoring the perimeter.',
  'Signal steady. I can queue another task whenever you are ready.',
  'No active queries detected. Standing by.',
  'Ambient noise minimal. Systems are responsive.',
];

const pickNextLine = (lastIndex: number): { index: number; line: string } => {
  if (SMALLTALK_LINES.length === 0) {
    return { index: -1, line: '' };
  }

  if (SMALLTALK_LINES.length === 1) {
    return { index: 0, line: SMALLTALK_LINES[0]! };
  }

  let index = Math.floor(Math.random() * SMALLTALK_LINES.length);
  if (index === lastIndex) {
    index = (index + 1) % SMALLTALK_LINES.length;
  }
  const line = SMALLTALK_LINES[index] ?? '';
  return { index, line };
};

/**
 * Starts the idle smalltalk loop for the assistant.
 */
export const startIdleChatter = (uiState: UIState): void => {
  let lastSmalltalkAt = 0;
  let lastLineIndex = -1;

  window.setInterval(() => {
    const now = Date.now();
    if (!uiState.canIdleChat()) {
      return;
    }
    if (!uiState.isIdleFor(IDLE_MIN_MS)) {
      return;
    }
    if (now - lastSmalltalkAt < SMALLTALK_COOLDOWN_MS) {
      return;
    }

    const next = pickNextLine(lastLineIndex);
    if (!next.line) {
      return;
    }

    lastLineIndex = next.index;
    lastSmalltalkAt = now;

    uiState.showSmalltalk(() => renderBubbleContent(next.line));
    uiState.addLog(`Idle smalltalk: "${next.line}"`);
    uiState.setMood('speaking');

    window.setTimeout(() => {
      if (uiState.isSmalltalkVisible()) {
        uiState.setMood('idle');
      }
    }, 850);

    window.setTimeout(() => {
      if (uiState.isSmalltalkVisible()) {
        uiState.hideBubble();
      }
    }, 6500);
  }, SMALLTALK_CHECK_MS);
};
