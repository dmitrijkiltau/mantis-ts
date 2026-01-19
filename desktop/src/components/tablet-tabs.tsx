/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useTabletTabs, type TabletTabId } from '../state/tablet-tabs-context';
import { useUIStateContext } from '../state/ui-state-context';

/**
 * Renders the tablet tab button row.
 */
const TAB_ITEMS: Array<{ id: TabletTabId; label: string }> = [
  { id: 'status', label: '[ STATUS ]' },
  { id: 'history', label: '[ HISTORY ]' },
  { id: 'logs', label: '[ LOGS ]' },
  { id: 'tools', label: '[ TOOLS ]' },
  { id: 'telemetry', label: '[ TELEMETRY ]' },
];

/**
 * Renders the tablet tab button row.
 */
export const TabletTabs: Component = () => {
  const { activeTab, setActiveTab } = useTabletTabs();
  const { uiState } = useUIStateContext();

  const handleSelect = (tabId: TabletTabId) => {
    setActiveTab(tabId);
    uiState()?.addLog(`Switched to ${tabId.toUpperCase()} panel`);
  };

  return (
    <div class="tablet-tabs">
      {TAB_ITEMS.map((tab) => (
        <button
          class="button tab-button"
          classList={{ active: activeTab() === tab.id }}
          data-tab={tab.id}
          onClick={() => handleSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
