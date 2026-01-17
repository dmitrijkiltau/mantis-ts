/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the tool catalog panel.
 */
export const ToolsPanel: Component = () => (
  <div class="tablet-panel" id="panel-tools">
    <div class="tool-panel">
      <div class="tool-panel-header">
        <div>
          <div class="tool-label">Available Tools</div>
          <div class="tool-subtext">Registered capabilities accessible to the orchestrator.</div>
        </div>
        <div class="tool-count-badge" id="tool-count">0 tools</div>
      </div>

      <div class="tool-grid" id="tool-list">
        <div class="tool-placeholder">Tool registry is loading...</div>
      </div>
    </div>
  </div>
);
