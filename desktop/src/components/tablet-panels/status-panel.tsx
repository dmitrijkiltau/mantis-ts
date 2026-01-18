/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../../state/ui-state-context';
import { useTabletTabs } from '../../state/tablet-tabs-context';

/**
 * Renders the system status panel.
 */
export const StatusPanel: Component = () => {
  const refs = useUIRefs();
  const { activeTab } = useTabletTabs();

  return (
    <div class="tablet-panel" id="panel-status" classList={{ active: activeTab() === 'status' }}>
      <div class="status-display">
        <div class="status-grid">
          <div class="status-card" data-state="OPERATIONAL">
            <span class="status-label">SYSTEM</span>
            <span class="status-value" id="status-system" ref={refs.statusSystem}>OPERATIONAL</span>
          </div>
          <div class="status-card" data-state="AWAITING_INPUT">
            <span class="status-label">STATE</span>
            <span class="status-value" id="status-state" ref={refs.statusState}>AWAITING_INPUT</span>
          </div>
          <div class="status-card" data-state="NONE">
            <span class="status-label">LAST_ACTION</span>
            <span class="status-value" id="status-action" ref={refs.statusAction}>NONE</span>
          </div>
        </div>
        <div class="status-contracts">
          <div class="status-section-header">
            <div class="status-section-label">CONTRACT MODELS</div>
            <div class="status-section-meta" id="contract-model-count" ref={refs.contractModelCount}>0 models</div>
          </div>
          <div class="contract-model-list" id="contract-models" ref={refs.contractModelList}>
            <div class="contract-model-placeholder">Loading contract models...</div>
          </div>
        </div>
      </div>
    </div>
  );
};
