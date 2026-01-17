/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { StatusPanel } from './tablet-panels/status-panel';
import { HistoryPanel } from './tablet-panels/history-panel';
import { LogsPanel } from './tablet-panels/logs-panel';
import { ToolsPanel } from './tablet-panels/tools-panel';
import { TelemetryPanel } from './tablet-panels/telemetry-panel';

/**
 * Renders the tablet panel stack.
 */
export const TabletPanels: Component = () => (
  <div class="tablet-screen">
    <div class="scan-line"></div>
    <StatusPanel />
    <HistoryPanel />
    <LogsPanel />
    <ToolsPanel />
    <TelemetryPanel />
  </div>
);
