/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { TabletTabs } from './tablet-tabs';
import { TabletPanels } from './tablet-panels';
import { useUIRefs } from '../state/ui-state-context';
import { TabletTabsProvider } from '../state/tablet-tabs-context';

/**
 * Renders the Fallout-inspired status tablet.
 */
export const PipTablet: Component = () => {
  const refs = useUIRefs();

  return (
    <div class="pip-tablet">
      <div class="tablet-header">
        <div class="tablet-title">
          <span class="title-icon">◈</span>
          <span>MANTIS.INTERFACE.v2.0</span>
        </div>
        <div class="tablet-stats">
          <span class="stat-item" id="stat-queries" ref={refs.statQueries}>Q:0</span>
          <span class="stat-item" id="stat-runtime" ref={refs.statRuntime}>RT:0s</span>
        </div>
      </div>

      <TabletTabsProvider>
        <TabletTabs />
        <TabletPanels />
      </TabletTabsProvider>
    </div>
  );
};
