/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';

/**
 * Renders the tablet tab button row.
 */
export const TabletTabs: Component = () => (
  <div class="tablet-tabs">
    <button class="tab-button active" data-tab="status">[ STATUS ]</button>
    <button class="tab-button" data-tab="history">[ HISTORY ]</button>
    <button class="tab-button" data-tab="logs">[ LOGS ]</button>
    <button class="tab-button" data-tab="tools">[ TOOLS ]</button>
    <button class="tab-button" data-tab="telemetry">[ TELEMETRY ]</button>
  </div>
);
