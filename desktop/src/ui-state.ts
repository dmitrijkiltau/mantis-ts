import { AvatarMood, AssistantAvatar } from './avatar';

export class UIState {
  private queryCount = 0;
  private sessionStart = Date.now();

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

  setMood(mood: AvatarMood): void {
    this.avatar?.setMood(mood);
    if (this.moodLabel) {
      const title = mood.toUpperCase();
      this.moodLabel.textContent = title;
      this.moodLabel.setAttribute('data-mood', mood);
    }
  }

  setStatus(system: string, state: string, action: string): void {
    if (this.statusSystem) this.statusSystem.textContent = system;
    if (this.statusState) this.statusState.textContent = state;
    if (this.statusAction) this.statusAction.textContent = action;
  }

  showBubble(html: string): void {
    if (this.speechBubble && this.bubbleAnswer) {
      this.bubbleAnswer.innerHTML = html;
      this.speechBubble.classList.remove('hidden');
    }
  }

  hideBubble(): void {
    if (this.speechBubble) {
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
