/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../../state/ui-state-context';
import { useTabletTabs } from '../../state/tablet-tabs-context';
import { handleRichContentInteraction } from '../../ui-handlers';

/**
 * Renders the query history panel.
 */
export const HistoryPanel: Component = () => {
  const refs = useUIRefs();
  const { activeTab } = useTabletTabs();

  return (
    <div class="tablet-panel" id="panel-history" classList={{ active: activeTab() === 'history' }}>
      <div
        class="history-list"
        id="history"
        ref={refs.historyElement}
        onClick={handleRichContentInteraction}
      ></div>
    </div>
  );
};
