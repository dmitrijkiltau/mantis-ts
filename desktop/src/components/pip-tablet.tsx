/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { TabletTabs } from './tablet-tabs';
import { TabletPanels } from './tablet-panels';

/**
 * Renders the Fallout-inspired status tablet.
 */
export const PipTablet: Component = () => (
  <div class="pip-tablet">
    <div class="tablet-header">
      <div class="tablet-title">
        <span class="title-icon">◈</span>
        <span>MANTIS.INTERFACE.v2.0</span>
      </div>
      <div class="tablet-stats">
        <span class="stat-item" id="stat-queries">Q:0</span>
        <span class="stat-item" id="stat-runtime">RT:0s</span>
      </div>
    </div>

    <TabletTabs />
    <TabletPanels />
  </div>
);
