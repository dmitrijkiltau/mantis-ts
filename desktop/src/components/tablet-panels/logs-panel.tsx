/** @jsxImportSource solid-js */
import type { Component } from 'solid-js';
import { useUIRefs } from '../../state/ui-state-context';
import { useTabletTabs } from '../../state/tablet-tabs-context';

/**
 * Renders the system log panel.
 */
export const LogsPanel: Component = () => {
  const refs = useUIRefs();
  const { activeTab } = useTabletTabs();

  return (
    <div class="tablet-panel" id="panel-logs" classList={{ active: activeTab() === 'logs' }}>
      <div class="logs-console" id="logs" ref={refs.logsConsole}>
        <div class="log-entry">MANTIS Desktop initialized...</div>
        <div class="log-entry">Awaiting user input...</div>
      </div>
    </div>
  );
};
