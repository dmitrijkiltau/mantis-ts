/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../../state/ui-state-context';
import { useTabletTabs } from '../../state/tablet-tabs-context';
import { ContractModels } from '../contract-models';

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
        <ContractModels />
      </div>
    </div>
  );
};
