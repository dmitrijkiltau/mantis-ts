import type { JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { AssistantAvatar } from './avatar';
import type { AvatarMood } from './avatar';
import type { EvaluationAlert } from '../../assistant/src/pipeline';
import { formatEvaluationSummary, getEvaluationAlertMessage } from './evaluation-utils';

export type TelemetryNodes = {
  totalEvaluations: HTMLElement | null;
  lowScoreCount: HTMLElement | null;
  failureCount: HTMLElement | null;
  averageContainer: HTMLElement | null;
  recentList: HTMLElement | null;
};

type EvaluationHistoryEntry = {
  timestamp: number;
  alert?: EvaluationAlert;
  label?: string;
  evaluation?: Record<string, number>;
};

const TELEMETRY_HISTORY_LIMIT = 5;

export class UIState {
  private queryCount = 0;
  private sessionStart = Date.now();
  private lastActivityAt = Date.now();
  private isBusy = false;
  private bubbleDispose: (() => void) | null = null;
  private telemetryNodes: TelemetryNodes = {
    totalEvaluations: null,
    lowScoreCount: null,
    failureCount: null,
    averageContainer: null,
    recentList: null,
  };
  private evaluationTotals = { total: 0, lowScores: 0, failures: 0 };
  private evaluationSums: Record<string, number> = {};
  private evaluationCounts: Record<string, number> = {};
  private evaluationHistory: EvaluationHistoryEntry[] = [];

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

  showBubble(content: string | (() => JSX.Element)): void {
    this.setBubble(content, 'response');
  }

  showSmalltalk(content: string | (() => JSX.Element)): void {
    this.setBubble(content, 'smalltalk');
  }

  private setBubble(content: string | (() => JSX.Element), kind: 'response' | 'smalltalk'): void {
    if (this.speechBubble && this.bubbleAnswer) {
      if (this.bubbleDispose) {
        this.bubbleDispose();
        this.bubbleDispose = null;
      }

      if (typeof content === 'string') {
        this.bubbleAnswer.innerHTML = content;
      } else {
        this.bubbleAnswer.innerHTML = '';
        this.bubbleDispose = render(content, this.bubbleAnswer);
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
      if (this.bubbleDispose) {
        this.bubbleDispose();
        this.bubbleDispose = null;
      }
      this.bubbleAnswer.innerHTML = '';
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

  recordEvaluation(
    evaluation: Record<string, number> | undefined,
    alert: EvaluationAlert | undefined,
    label?: string,
  ): void {
    if (!evaluation && !alert) {
      return;
    }

    this.evaluationTotals.total += 1;
    if (alert === 'low_scores') {
      this.evaluationTotals.lowScores += 1;
    }
    if (alert === 'scoring_failed') {
      this.evaluationTotals.failures += 1;
    }

    if (evaluation) {
      const entries = Object.entries(evaluation);
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        if (!entry) {
          continue;
        }
        const [criterion, value] = entry;
        if (typeof value !== 'number' || Number.isNaN(value)) {
          continue;
        }
        this.evaluationSums[criterion] = (this.evaluationSums[criterion] ?? 0) + value;
        this.evaluationCounts[criterion] = (this.evaluationCounts[criterion] ?? 0) + 1;
      }
    }

    const record: EvaluationHistoryEntry = {
      timestamp: Date.now(),
      alert,
      label,
    };
    if (evaluation) {
      record.evaluation = { ...evaluation };
    }
    this.evaluationHistory.unshift(record);
    if (this.evaluationHistory.length > TELEMETRY_HISTORY_LIMIT) {
      this.evaluationHistory.pop();
    }

    this.refreshTelemetry();
  }

  private refreshTelemetry(): void {
    const {
      totalEvaluations,
      lowScoreCount,
      failureCount,
      averageContainer,
      recentList,
    } = this.telemetryNodes;

    if (totalEvaluations) {
      totalEvaluations.textContent = String(this.evaluationTotals.total);
    }
    if (lowScoreCount) {
      lowScoreCount.textContent = String(this.evaluationTotals.lowScores);
    }
    if (failureCount) {
      failureCount.textContent = String(this.evaluationTotals.failures);
    }

    if (averageContainer) {
      averageContainer.innerHTML = '';
      const criteria = Object.keys(this.evaluationSums)
        .filter((criterion) => (this.evaluationCounts[criterion] ?? 0) > 0)
        .sort();

      if (criteria.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'telemetry-averages-placeholder';
        placeholder.textContent = 'Waiting for scores...';
        averageContainer.appendChild(placeholder);
      } else {
        for (const criterion of criteria) {
          const count = this.evaluationCounts[criterion] ?? 1;
          const total = this.evaluationSums[criterion] ?? 0;
          const average = total / count;
          averageContainer.appendChild(this.createAverageRow(criterion, average));
        }
      }
    }

    if (recentList) {
      recentList.innerHTML = '';
      if (this.evaluationHistory.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'telemetry-recent-placeholder';
        placeholder.textContent = 'No evaluation events yet.';
        recentList.appendChild(placeholder);
      } else {
        for (const entry of this.evaluationHistory) {
          recentList.appendChild(this.createRecentItem(entry));
        }
      }
    }
  }

  private createAverageRow(criterion: string, average: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'telemetry-average-row';

    const label = document.createElement('span');
    label.textContent = criterion;

    const value = document.createElement('span');
    value.textContent = average.toFixed(1);

    row.appendChild(label);
    row.appendChild(value);
    return row;
  }

  private createRecentItem(entry: EvaluationHistoryEntry): HTMLElement {
    const item = document.createElement('div');
    item.className = 'telemetry-recent-item';

    const time = document.createElement('span');
    time.className = 'telemetry-recent-time';
    time.textContent = new Date(entry.timestamp).toLocaleTimeString([], { hour12: false });

    const label = document.createElement('span');
    label.className = 'telemetry-recent-label';
    label.textContent = entry.label ?? 'Evaluation event';

    item.appendChild(time);
    item.appendChild(label);

    if (entry.alert) {
      const alertNode = document.createElement('span');
      alertNode.className = 'telemetry-recent-alert';
      alertNode.textContent = getEvaluationAlertMessage(entry.alert);
      item.appendChild(alertNode);
    }

    if (entry.evaluation) {
      const detail = document.createElement('span');
      detail.className = 'telemetry-recent-detail';
      detail.textContent = formatEvaluationSummary(entry.evaluation);
      item.appendChild(detail);
    }

    return item;
  }
}
