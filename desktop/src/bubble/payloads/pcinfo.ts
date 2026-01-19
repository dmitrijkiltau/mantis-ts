import type { PcInfoPayload, PcInfoSections } from '../bubble-types';
import { escapeHtml, formatBytes, formatUptime } from '../shared';

/**
 * Renders a label/value row for PC info cards.
 */
const renderPcInfoRow = (label: string, value: string): string => `
  <div class="pcinfo-row">
    <span class="pcinfo-row-label">${escapeHtml(label)}</span>
    <span class="pcinfo-row-value">${escapeHtml(value)}</span>
  </div>
`;

/**
 * Renders a usage bar for PC info metrics.
 */
const renderPcInfoUsageBar = (label: string, percent: number | null, detail?: string): string => {
  const value = percent === null || !Number.isFinite(percent) ? null : Math.max(0, Math.min(100, percent));
  const display = value === null ? 'N/A' : `${value.toFixed(1)}%`;
  const detailText = detail ? `<span class="pcinfo-bar-detail">${escapeHtml(detail)}</span>` : '';

  return `
    <div class="pcinfo-bar">
      <span class="pcinfo-bar-label">${escapeHtml(label)}</span>
      <div class="pcinfo-bar-track">
        <div class="pcinfo-bar-fill" style="width: ${value ?? 0}%"></div>
        <span class="pcinfo-bar-value">${display}</span>
      </div>
      ${detailText}
    </div>
  `;
};

type PcInfoCompactCard = {
  label: string;
  title: string;
  subtitle: string;
  body: string;
};

/**
 * Builds the card sections for PC info.
 */
export const buildPcInfoSections = (payload: PcInfoPayload): PcInfoSections => {
  const system = payload.system;
  const cpu = payload.cpu;
  const memory = payload.memory;
  const disks = payload.disks ?? [];

  const systemRows = system
    ? [
        renderPcInfoRow('Platform', system.platform ?? 'N/A'),
        renderPcInfoRow('Hostname', system.hostname ?? 'N/A'),
        renderPcInfoRow('Uptime', formatUptime(system.uptime)),
      ].join('')
    : '';

  const cpuModel = cpu?.model ?? 'Unknown CPU';
  const cpuMeta = cpu
    ? `${cpu.cores ?? 'N/A'} cores / ${cpu.threads ?? 'N/A'} threads`
    : 'N/A';

  const cpuCard = cpu
    ? `
      <div class="pcinfo-card">
        <div class="pcinfo-card-header">CPU</div>
        <div class="pcinfo-card-body">
          <div class="pcinfo-title">${escapeHtml(cpuModel)}</div>
          ${renderPcInfoRow('Topology', cpuMeta)}
          ${renderPcInfoUsageBar('Usage', cpu.usage, cpu?.usage !== null ? 'Current load' : undefined)}
        </div>
      </div>
    `
    : '';

  const memoryCard = memory
    ? `
      <div class="pcinfo-card">
        <div class="pcinfo-card-header">MEMORY</div>
        <div class="pcinfo-card-body">
          ${renderPcInfoUsageBar(
            'Usage',
            memory.usagePercent,
            memory.totalBytes ? `${formatBytes(memory.usedBytes ?? 0)} / ${formatBytes(memory.totalBytes)}` : 'N/A',
          )}
          ${renderPcInfoRow('Free', memory.freeBytes !== null ? formatBytes(memory.freeBytes) : 'N/A')}
        </div>
      </div>
    `
    : '';

  const diskCard = disks.length > 0
    ? `
      <div class="pcinfo-card">
        <div class="pcinfo-card-header">DISK</div>
        <div class="pcinfo-card-body">
          ${disks.map((disk) => `
            <div class="pcinfo-disk">
              <div class="pcinfo-title">${escapeHtml(disk.path)}</div>
              ${renderPcInfoUsageBar(
                'Usage',
                disk.usagePercent,
                disk.totalBytes ? `${formatBytes(disk.usedBytes ?? 0)} / ${formatBytes(disk.totalBytes)}` : 'N/A',
              )}
              ${renderPcInfoRow('Free', disk.freeBytes !== null ? formatBytes(disk.freeBytes) : 'N/A')}
            </div>
          `).join('')}
        </div>
      </div>
    `
    : '';

  const systemCard = systemRows
    ? `
      <div class="pcinfo-card">
        <div class="pcinfo-card-header">SYSTEM</div>
        <div class="pcinfo-card-body">
          ${systemRows}
        </div>
      </div>
    `
    : '';

  let primaryCount = 0;
  if (cpuCard) {
    primaryCount += 1;
  }
  if (memoryCard) {
    primaryCount += 1;
  }
  if (diskCard) {
    primaryCount += 1;
  }

  let totalCount = primaryCount;
  if (systemCard) {
    totalCount += 1;
  }
  return {
    systemCard,
    cpuCard,
    memoryCard,
    diskCard,
    primaryCount,
    totalCount,
  };
};

/**
 * Builds a compact PC info card when only one section exists.
 */
export const buildPcInfoCompactCard = (payload: PcInfoPayload): PcInfoCompactCard | null => {
  const cpu = payload.cpu;
  if (cpu) {
    const title = cpu.model ?? 'Unknown CPU';
    const subtitle = `${cpu.cores ?? 'N/A'} cores / ${cpu.threads ?? 'N/A'} threads`;
    return {
      label: 'CPU',
      title,
      subtitle,
      body: `
        <div class="pcinfo-compact">
          ${renderPcInfoUsageBar('Usage', cpu.usage, cpu.usage !== null ? 'Current load' : undefined)}
        </div>
      `,
    };
  }

  const memory = payload.memory;
  if (memory) {
    const total = memory.totalBytes !== null ? formatBytes(memory.totalBytes) : 'Memory';
    const usage = memory.usagePercent !== null && Number.isFinite(memory.usagePercent)
      ? `${memory.usagePercent.toFixed(1)}%`
      : 'N/A';
    return {
      label: 'MEMORY',
      title: total,
      subtitle: `Usage ${usage}`,
      body: `
        <div class="pcinfo-compact">
          ${renderPcInfoUsageBar(
            'Usage',
            memory.usagePercent,
            memory.totalBytes ? `${formatBytes(memory.usedBytes ?? 0)} / ${formatBytes(memory.totalBytes)}` : 'N/A',
          )}
          ${renderPcInfoRow('Free', memory.freeBytes !== null ? formatBytes(memory.freeBytes) : 'N/A')}
        </div>
      `,
    };
  }

  const disks = payload.disks ?? [];
  if (disks.length > 0) {
    const disk = disks[0];
    const title = disk?.path ?? 'Disk';
    const usage = disk && disk.usagePercent !== null && Number.isFinite(disk.usagePercent)
      ? `${disk.usagePercent.toFixed(1)}%`
      : 'N/A';
    return {
      label: 'DISK',
      title,
      subtitle: `Usage ${usage}`,
      body: `
        <div class="pcinfo-compact">
          ${disk ? renderPcInfoUsageBar(
            'Usage',
            disk.usagePercent,
            disk.totalBytes ? `${formatBytes(disk.usedBytes ?? 0)} / ${formatBytes(disk.totalBytes)}` : 'N/A',
          ) : ''}
          ${disk ? renderPcInfoRow('Free', disk.freeBytes !== null ? formatBytes(disk.freeBytes) : 'N/A') : ''}
        </div>
      `,
    };
  }

  const system = payload.system;
  if (system) {
    const title = system.hostname ?? system.platform ?? 'System';
    const subtitle = `Uptime ${formatUptime(system.uptime)}`;
    return {
      label: 'SYSTEM',
      title,
      subtitle,
      body: `
        <div class="pcinfo-compact">
          ${renderPcInfoRow('Platform', system.platform ?? 'N/A')}
          ${renderPcInfoRow('Hostname', system.hostname ?? 'N/A')}
          ${renderPcInfoRow('Uptime', formatUptime(system.uptime))}
        </div>
      `,
    };
  }

  return null;
};

/**
 * Renders the PC info payload into a card-based layout.
 */
export const renderPcInfoPayload = (payload: PcInfoPayload): string => {
  const sections = buildPcInfoSections(payload);

  return `
    <div class="pcinfo-panel">
      ${sections.systemCard}
      ${sections.cpuCard}
      ${sections.memoryCard}
      ${sections.diskCard}
    </div>
  `;
};
