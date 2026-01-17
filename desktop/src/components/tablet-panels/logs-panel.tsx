/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the system log panel.
 */
export const LogsPanel: Component = () => (
  <div class="tablet-panel" id="panel-logs">
    <div class="logs-console" id="logs">
      <div class="log-entry">MANTIS Desktop initialized...</div>
      <div class="log-entry">Awaiting user input...</div>
    </div>
  </div>
);
