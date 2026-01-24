import type { ContractName } from '../../../assistant/src/orchestrator';
import type { ContractExecutionTelemetry } from '../../../assistant/src/types';

export type ContractTelemetrySnapshot = {
  lastExecAt: number | null;
  averageLatencyMs: number | null;
};

type ContractTelemetryEntry = {
  lastExecAt: number | null;
  latencyTotal: number;
  latencyCount: number;
};

export type ContractTelemetryListener = (snapshot: Record<ContractName, ContractTelemetrySnapshot>) => void;

/**
 * Stores contract execution telemetry for the status panel.
 */
export class ContractTelemetryStore {
  private entries = new Map<ContractName, ContractTelemetryEntry>();
  private listeners = new Set<ContractTelemetryListener>();

  /**
   * Records a contract execution event and updates listeners.
   */
  record(event: ContractExecutionTelemetry): void {
    const existing = this.entries.get(event.contractName);
    const entry: ContractTelemetryEntry = existing ?? {
      lastExecAt: null,
      latencyTotal: 0,
      latencyCount: 0,
    };

    entry.lastExecAt = event.timestamp;
    entry.latencyTotal += event.durationMs;
    entry.latencyCount += 1;

    this.entries.set(event.contractName, entry);
    this.notifyListeners();
  }

  /**
   * Returns a snapshot of all telemetry entries.
   */
  getSnapshot(): Record<ContractName, ContractTelemetrySnapshot> {
    const snapshot: Record<string, ContractTelemetrySnapshot> = {};
    for (const [contractName, entry] of this.entries.entries()) {
      snapshot[contractName] = {
        lastExecAt: entry.lastExecAt,
        averageLatencyMs: entry.latencyCount > 0
          ? entry.latencyTotal / entry.latencyCount
          : null,
      };
    }
    return snapshot as Record<ContractName, ContractTelemetrySnapshot>;
  }

  /**
   * Subscribes to telemetry updates.
   */
  subscribe(listener: ContractTelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    if (this.listeners.size === 0) {
      return;
    }

    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
