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
            Telemetry
          </div>
          <div class="telemetry-subtitle">
            Real-time routing and execution metrics.
          </div>
        </div>
        <div class="telemetry-grid">
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Tool calls</span>
            <span class="telemetry-metric-value" id="telemetry-tool-call-count" ref={refs.telemetryToolCalls}>0</span>
          </div>
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Avg attempts/request</span>
            <span class="telemetry-metric-value" id="telemetry-average-attempts" ref={refs.telemetryAverageAttempts}>0.0</span>
          </div>
          <div class="telemetry-metric">
            <span class="telemetry-metric-label">Schema mismatches</span>
            <span class="telemetry-metric-value" id="telemetry-schema-mismatch-count" ref={refs.telemetrySchemaMismatch}>0</span>
          </div>
        </div>
        <div class="telemetry-averages">
          <div class="telemetry-section-label">Averages</div>
          <div class="telemetry-averages-list" id="telemetry-averages" ref={refs.telemetryAverages}>
            <div class="telemetry-averages-placeholder">Telemetry averages are not available.</div>
          </div>
        </div>
        <div class="telemetry-recent">
          <div class="telemetry-section-label">Recent alerts</div>
          <div class="telemetry-recent-list" id="telemetry-recent" ref={refs.telemetryRecent}>
            <div class="telemetry-recent-placeholder">No telemetry events yet.</div>
          </div>
        </div>
      </div>
    </div>
  );
};
