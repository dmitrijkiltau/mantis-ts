/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the system status panel.
 */
export const StatusPanel: Component = () => (
  <div class="tablet-panel active" id="panel-status">
    <div class="status-display">
      <div class="status-grid">
        <div class="status-card" data-state="OPERATIONAL">
          <span class="status-label">SYSTEM</span>
          <span class="status-value" id="status-system">OPERATIONAL</span>
        </div>
        <div class="status-card" data-state="AWAITING_INPUT">
          <span class="status-label">STATE</span>
          <span class="status-value" id="status-state">AWAITING_INPUT</span>
        </div>
        <div class="status-card" data-state="NONE">
          <span class="status-label">LAST_ACTION</span>
          <span class="status-value" id="status-action">NONE</span>
        </div>
      </div>
      <div class="status-contracts">
        <div class="status-section-header">
          <div class="status-section-label">CONTRACT MODELS</div>
          <div class="status-section-meta" id="contract-model-count">0 models</div>
        </div>
        <div class="contract-model-list" id="contract-models">
          <div class="contract-model-placeholder">Loading contract models...</div>
        </div>
      </div>
    </div>
  </div>
);
