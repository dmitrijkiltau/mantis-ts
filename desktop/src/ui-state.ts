import { AssistantAvatar } from './avatar';
import type { AvatarMood } from './avatar';

export class UIState {
  private queryCount = 0;
  private sessionStart = Date.now();
  private lastActivityAt = Date.now();
  private isBusy = false;

  constructor(
    private avatar: AssistantAvatar | null,
    private moodLabel: HTMLElement | null,
    private speechBubble: HTMLElement | null,
    private bubbleAnswer: HTMLElement | null,
    private logsConsole: HTMLElement | null,
    private statusSystem: HTMLElement | null,
    private statusState: HTMLElement | null,
    private statusAction: HTMLElement | null,
    private statQueries: HTMLElement | null,
    private statRuntime: HTMLElement | null,
  ) {}

  /**
   * Records a user interaction timestamp.
   */
  markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /**
   * Tracks whether a query is currently running.
   */
  setBusy(isBusy: boolean): void {
    this.isBusy = isBusy;
    if (isBusy) {
      this.lastActivityAt = Date.now();
    }
  }

  /**
   * Returns true when the UI has been idle for a duration.
   */
  isIdleFor(durationMs: number): boolean {
    return Date.now() - this.lastActivityAt >= durationMs;
  }

  /**
   * Returns true when the speech bubble is not visible.
   */
  isBubbleHidden(): boolean {
    return !this.speechBubble || this.speechBubble.classList.contains('hidden');
  }

  /**
   * Returns true when smalltalk is currently displayed.
   */
  isSmalltalkVisible(): boolean {
    return !!this.speechBubble
      && !this.speechBubble.classList.contains('hidden')
      && this.speechBubble.dataset.bubbleKind === 'smalltalk';
  }

  /**
   * Returns true when idle chatter can be shown.
   */
  canIdleChat(): boolean {
    return !this.isBusy && this.isBubbleHidden();
  }

  setMood(mood: AvatarMood): void {
    this.avatar?.setMood(mood);
    if (this.moodLabel) {
      const title = mood.toUpperCase();
      this.moodLabel.textContent = title;
      this.moodLabel.setAttribute('data-mood', mood);
    }
  }

  setStatus(system: string, state: string, action: string): void {
    if (this.statusSystem) {
      this.statusSystem.textContent = system;
      const card = this.statusSystem.closest<HTMLElement>('.status-card');
      if (card) card.dataset.state = system;
    }
    if (this.statusState) {
      this.statusState.textContent = state;
      const card = this.statusState.closest<HTMLElement>('.status-card');
      if (card) card.dataset.state = state;
    }
    if (this.statusAction) {
      this.statusAction.textContent = action;
      const card = this.statusAction.closest<HTMLElement>('.status-card');
      if (card) card.dataset.state = action;
    }
  }

  showBubble(html: string): void {
    this.setBubble(html, 'response');
  }

  showSmalltalk(html: string): void {
    this.setBubble(html, 'smalltalk');
  }

  private setBubble(html: string, kind: 'response' | 'smalltalk'): void {
    if (this.speechBubble && this.bubbleAnswer) {
      this.bubbleAnswer.innerHTML = html;
      this.speechBubble.dataset.bubbleKind = kind;
      this.speechBubble.classList.remove('hidden');
    }
  }

  hideBubble(): void {
    if (this.speechBubble) {
      delete this.speechBubble.dataset.bubbleKind;
      this.speechBubble.classList.add('hidden');
    }
  }

  addLog(message: string): void {
    if (this.logsConsole) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const timestamp = new Date().toLocaleTimeString();
      entry.textContent = `[${timestamp}] ${message}`;
      this.logsConsole.appendChild(entry);
      this.logsConsole.scrollTop = this.logsConsole.scrollHeight;
    }
  }

  incrementQueryCount(): void {
    this.queryCount += 1;
  }

  updateStats(): void {
    const runtimeSeconds = Math.floor((Date.now() - this.sessionStart) / 1000);
    if (this.statQueries) this.statQueries.textContent = `Q:${this.queryCount}`;
    if (this.statRuntime) this.statRuntime.textContent = `RT:${runtimeSeconds}s`;
  }
}
