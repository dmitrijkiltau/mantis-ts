import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { AssistantAvatar } from './avatar';
import type { AvatarMood } from './avatar';
import type { PipelineResult } from '../../assistant/src/pipeline';

export type TelemetryNodes = {
  toolCallCount: HTMLElement | null;
  averageAttempts: HTMLElement | null;
  schemaMismatchCount: HTMLElement | null;
  averageContainer: HTMLElement | null;
  recentList: HTMLElement | null;
};

export type BubbleRenderFn = () => JSX.Element;

export type BubbleContent =
  | {
      kind: 'static';
      render: BubbleRenderFn;
    }
  | {
      kind: 'typewriter';
      text: string;
      render: BubbleRenderFn;
    }
  | {
      kind: 'inline-typewriter';
      text: string;
      render: BubbleRenderFn;
      targetSelector: string;
      finalHtml: string;
    };




const TYPEWRITER_MIN_DELAY_MS = 12;
const TYPEWRITER_MAX_DELAY_MS = 26;
const TYPEWRITER_PUNCTUATION_PAUSE_MS = 140;

export class UIState {
  private queryCount = 0;
  private sessionStart = Date.now();
  private lastActivityAt = Date.now();
  private isBusy = false;
  private bubbleDispose: (() => void) | null = null;
  private telemetryNodes: TelemetryNodes = {
    toolCallCount: null,
    averageAttempts: null,
    schemaMismatchCount: null,
    averageContainer: null,
    recentList: null,
  };

  private requestCount = 0;
  private attemptTotal = 0;
  private toolCallCount = 0;
  private schemaMismatchCount = 0;
  private typewriterTimer: number | null = null;
  private typewriterToken = 0;
  private typingActive = false;
  private deferredMood: AvatarMood | null = null;
  private typingTarget: HTMLElement | null = null;

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
    if (this.typingActive && mood === 'idle') {
      this.deferredMood = mood;
      return;
    }
    if (this.typingActive) {
      this.deferredMood = null;
    }

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

  showBubble(content: BubbleContent): void {
    this.setBubble(content, 'response');
  }

  showSmalltalk(content: BubbleContent): void {
    this.setBubble(content, 'smalltalk');
  }

  private setBubble(content: BubbleContent, kind: 'response' | 'smalltalk'): void {
    if (this.speechBubble && this.bubbleAnswer) {
      this.clearTypewriter();
      this.resetBubbleContent();

      if (content.kind === 'typewriter') {
        this.startTypewriter(content);
      } else if (content.kind === 'inline-typewriter') {
        this.renderBubbleContent(content.render);
        this.startInlineTypewriter(content);
      } else {
        this.renderBubbleContent(content.render);
      }
      this.speechBubble.dataset.bubbleKind = kind;
      this.speechBubble.classList.remove('hidden');
    }
  }

  hideBubble(): void {
    if (this.speechBubble) {
      delete this.speechBubble.dataset.bubbleKind;
      this.speechBubble.classList.add('hidden');
    }
    if (this.bubbleAnswer) {
      this.clearTypewriter();
      this.resetBubbleContent();
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

  registerTelemetryNodes(nodes: TelemetryNodes): void {
    this.telemetryNodes = nodes;
    this.refreshTelemetry();
  }

  recordPipelineResult(result: PipelineResult): void {
    this.requestCount += 1;
    this.attemptTotal += result.attempts;

    if (result.ok && result.kind === 'tool') {
      this.toolCallCount += 1;
    }

    if (!result.ok && result.error?.code === 'tool_error') {
      const message = result.error.message ?? '';
      if (message.startsWith('Invalid direct tool arguments')) {
        this.schemaMismatchCount += 1;
      }
    }

    this.refreshTelemetry();
  }



  private refreshTelemetry(): void {
    const {
      toolCallCount,
      averageAttempts,
      schemaMismatchCount,
      averageContainer,
      recentList,
    } = this.telemetryNodes;

    if (toolCallCount) {
      toolCallCount.textContent = String(this.toolCallCount);
    }
    if (averageAttempts) {
      const average = this.requestCount > 0 ? this.attemptTotal / this.requestCount : 0;
      averageAttempts.textContent = average.toFixed(1);
    }
    if (schemaMismatchCount) {
      schemaMismatchCount.textContent = String(this.schemaMismatchCount);
    }

    if (averageContainer) {
      averageContainer.innerHTML = '';
      const placeholder = document.createElement('div');
      placeholder.className = 'telemetry-averages-placeholder';
      placeholder.textContent = 'Telemetry averages are not available.';
      averageContainer.appendChild(placeholder);
    }

    if (recentList) {
      recentList.innerHTML = '';
      const placeholder = document.createElement('div');
      placeholder.className = 'telemetry-recent-placeholder';
      placeholder.textContent = 'No telemetry events yet.';
      recentList.appendChild(placeholder);
    }
  }

  /**
   * Clears any existing rendered bubble content.
   */
  private resetBubbleContent(): void {
    if (this.bubbleDispose) {
      this.bubbleDispose();
      this.bubbleDispose = null;
    }
    if (this.bubbleAnswer) {
      this.bubbleAnswer.innerHTML = '';
    }
  }

  /**
   * Renders bubble content into the live response container.
   */
  private renderBubbleContent(content: BubbleRenderFn): void {
    if (!this.bubbleAnswer) {
      return;
    }
    this.bubbleAnswer.innerHTML = '';
    this.bubbleDispose = render(content, this.bubbleAnswer);
  }

  /**
   * Cancels any active typewriter effect.
   */
  private clearTypewriter(): void {
    if (this.typewriterTimer !== null) {
      window.clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
    this.typewriterToken += 1;
    this.typingActive = false;
    this.deferredMood = null;
    if (this.typingTarget) {
      this.typingTarget.classList.remove('typing');
      this.typingTarget = null;
    }
    if (this.bubbleAnswer) {
      this.bubbleAnswer.classList.remove('typing');
    }
  }

  /**
   * Computes the per-character delay for the typewriter animation.
   */
  private getTypewriterDelay(textLength: number): number {
    if (textLength <= 0) {
      return TYPEWRITER_MIN_DELAY_MS;
    }

    const scaled = Math.round(28 - textLength / 12);
    return Math.min(TYPEWRITER_MAX_DELAY_MS, Math.max(TYPEWRITER_MIN_DELAY_MS, scaled));
  }

  /**
   * Plays the typewriter animation for live bubble content.
   */
  private startTypewriter(content: Extract<BubbleContent, { kind: 'typewriter' }>): void {
    if (!this.bubbleAnswer) {
      return;
    }

    this.beginTypewriter(content.text, this.bubbleAnswer, () => {
      this.renderBubbleContent(content.render);
    });
  }

  /**
   * Plays a typewriter animation inside a summary node.
   */
  private startInlineTypewriter(content: Extract<BubbleContent, { kind: 'inline-typewriter' }>): void {
    if (!this.bubbleAnswer) {
      return;
    }

    const target = this.bubbleAnswer.querySelector<HTMLElement>(content.targetSelector);
    if (!target) {
      return;
    }

    this.beginTypewriter(content.text, target, () => {
      if (!this.bubbleAnswer) {
        return;
      }
      const finalTarget = this.bubbleAnswer.querySelector<HTMLElement>(content.targetSelector);
      if (!finalTarget) {
        return;
      }
      finalTarget.innerHTML = content.finalHtml;
    });
  }

  /**
   * Runs a typewriter animation on a target element.
   */
  private beginTypewriter(text: string, target: HTMLElement, onComplete: () => void): void {
    this.typingActive = true;
    this.deferredMood = null;
    this.typingTarget = target;
    target.classList.add('typing');
    this.setMood('speaking');

    const token = this.typewriterToken;
    const delay = this.getTypewriterDelay(text.length);
    let index = 0;
    target.textContent = '';

    const tick = () => {
      if (token !== this.typewriterToken || !this.typingTarget) {
        return;
      }

      if (index >= text.length) {
        this.finishTypewriter(onComplete, token);
        return;
      }

      const nextChar = text[index] ?? '';
      index += 1;
      this.typingTarget.textContent = text.slice(0, index);
      if (this.bubbleAnswer) {
        this.bubbleAnswer.scrollTop = this.bubbleAnswer.scrollHeight;
      }

      const pause = /[.!?]/.test(nextChar) ? TYPEWRITER_PUNCTUATION_PAUSE_MS : 0;
      this.typewriterTimer = window.setTimeout(tick, delay + pause);
    };

    tick();
  }

  /**
   * Restores the rendered markup after the typewriter completes.
   */
  private finishTypewriter(onComplete: () => void, token: number): void {
    if (token !== this.typewriterToken) {
      return;
    }

    this.typewriterTimer = null;
    this.typingActive = false;
    if (this.typingTarget) {
      this.typingTarget.classList.remove('typing');
      this.typingTarget = null;
    }
    if (this.bubbleAnswer) {
      this.bubbleAnswer.classList.remove('typing');
    }
    onComplete();
    if (this.deferredMood) {
      const mood = this.deferredMood;
      this.deferredMood = null;
      this.setMood(mood);
    }
  }




}
