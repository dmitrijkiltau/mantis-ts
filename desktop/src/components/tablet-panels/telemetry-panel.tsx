/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../../state/ui-state-context';
import { useTabletTabs } from '../../state/tablet-tabs-context';

/**
 * Renders the telemetry panel that surfaces evaluation metrics.
 */
export const TelemetryPanel: Component = () => {
  const refs = useUIRefs();
  const { activeTab } = useTabletTabs();

  return (
    <div class="tablet-panel" id="panel-telemetry" classList={{ active: activeTab() === 'telemetry' }}>
      <div class="telemetry-panel">
        <div class="telemetry-header">
          <div class="telemetry-title">
            Evaluation Trends
          </div>
          <div class="telemetry-subtitle">
            Real-time scoring telemetry for clarity, correctness, usefulness.
          </div>
        </div>
        <div class="telemetry-grid">
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Total evaluations</span>
            <span class="telemetry-metric-value" id="telemetry-total-evaluations" ref={refs.telemetryTotal}>0</span>
          </div>
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Low-score warnings</span>
            <span class="telemetry-metric-value" id="telemetry-low-score-count" ref={refs.telemetryLowScore}>0</span>
          </div>
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Scoring failures</span>
            <span class="telemetry-metric-value" id="telemetry-failure-count" ref={refs.telemetryFailures}>0</span>
          </div>
        </div>
        <div class="telemetry-averages">
          <div class="telemetry-section-label">Averages</div>
          <div class="telemetry-averages-list" id="telemetry-averages" ref={refs.telemetryAverages}>
            <div class="telemetry-averages-placeholder">Waiting for scores...</div>
          </div>
        </div>
        <div class="telemetry-recent">
          <div class="telemetry-section-label">Recent alerts</div>
          <div class="telemetry-recent-list" id="telemetry-recent" ref={refs.telemetryRecent}>
            <div class="telemetry-recent-placeholder">No evaluation events yet.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
