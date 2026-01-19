import type { ProcessListResult } from '../bubble-types';
import { escapeHtml, formatBytes, formatRuntime } from '../shared';

export const renderProcessListPayload = (payload: ProcessListResult): string => {
  const header = `
    <div class="process-list-header">
      <span class="process-list-title">RUNNING PROCESSES</span>
      <span class="process-list-meta">${payload.processes.length} of ${payload.total} PROCESSES</span>
      ${payload.truncated ? '<span class="process-list-warning">TRUNCATED</span>' : ''}
    </div>
  `;

  const rows = payload.processes.map((proc) => {
    // Normalize CPU: if > 100, it's cumulative seconds, convert to display percentage
    // Use log scale for better visualization of high CPU time values
    let cpuBar = 0;
    let cpuText = 'N/A';
    if (proc.cpu !== null) {
      if (proc.cpu <= 100) {
        cpuBar = Math.max(0, proc.cpu);
        cpuText = `${proc.cpu.toFixed(1)}%`;
      } else {
        // Cumulative CPU seconds - use log scale for visualization (max at ~10000s = 100%)
        cpuBar = Math.min(100, (Math.log10(proc.cpu + 1) / 4) * 100);
        cpuText = `${proc.cpu.toFixed(1)}s`;
      }
    }
    const memText = proc.memoryBytes !== null ? formatBytes(proc.memoryBytes) : 'N/A';
    const runtimeText = proc.runtimeSeconds !== null ? formatRuntime(proc.runtimeSeconds) : 'N/A';
    const commandText = proc.command ? `<span class="process-command">${escapeHtml(proc.command)}</span>` : '';
    const cpuTextClass = cpuBar > 50 ? 'process-cpu-text-filled' : 'process-cpu-text-empty';

    return `
      <div class="process-row">
        <div class="process-main">
          <span class="process-pid">${proc.pid}</span>
          <span class="process-name">${escapeHtml(proc.name)}</span>
        </div>
        <div class="process-stats">
          <div class="process-stat">
            <span class="process-stat-label">CPU</span>
            <div class="process-cpu-bar">
              <div class="process-cpu-fill" style="width: ${cpuBar}%"></div>
              <span class="process-cpu-text ${cpuTextClass}">${cpuText}</span>
            </div>
          </div>
          <div class="process-stat">
            <span class="process-stat-label">MEM</span>
            <span class="process-stat-value">${memText}</span>
          </div>
          <div class="process-stat">
            <span class="process-stat-label">TIME</span>
            <span class="process-stat-value">${runtimeText}</span>
          </div>
        </div>
        ${commandText}
      </div>
    `;
  }).join('');

  return `
    <div class="process-list">
      ${header}
      <div class="process-list-body">
        ${rows}
      </div>
    </div>
  `;
};
