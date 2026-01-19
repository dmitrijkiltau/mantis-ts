/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useTabletTabs } from '../../state/tablet-tabs-context';
import { ToolCatalog } from '../tool-catalog';

/**
 * Renders the tool catalog panel.
 */
export const ToolsPanel: Component = () => {
  const { activeTab } = useTabletTabs();

  return (
    <div class="tablet-panel" id="panel-tools" classList={{ active: activeTab() === 'tools' }}>
      <ToolCatalog />
    </div>
  );
};
