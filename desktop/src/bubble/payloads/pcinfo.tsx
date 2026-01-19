import type { Component, JSX } from 'solid-js';
import type { PcInfoPayload, PcInfoSections } from '../bubble-types';
import { formatBytes, formatUptime } from '../shared';

const PcInfoRow: Component<{ label: string; value: string }> = (props) => (
  <div class="pcinfo-row">
    <span class="pcinfo-row-label">{props.label}</span>
    <span class="pcinfo-row-value">{props.value}</span>
  </div>
);

const PcInfoUsageBar: Component<{ label: string; percent: number | null; detail?: string }> = (props) => {
  const value = props.percent === null || !Number.isFinite(props.percent)
    ? null
    : Math.max(0, Math.min(100, props.percent));
  const display = value === null ? 'N/A' : `${value.toFixed(1)}%`;

  return (
    <div class="pcinfo-bar">
      <span class="pcinfo-bar-label">{props.label}</span>
      <div class="pcinfo-bar-track">
        <div class="pcinfo-bar-fill" style={{ width: `${value ?? 0}%` }}></div>
        <span class="pcinfo-bar-value">{display}</span>
      </div>
      {props.detail ? <span class="pcinfo-bar-detail">{props.detail}</span> : null}
    </div>
  );
};

type PcInfoCompactCard = {
  label: string;
  title: string;
  subtitle: string;
  body: JSX.Element;
};

export const buildPcInfoSections = (payload: PcInfoPayload): PcInfoSections => {
  const system = payload.system;
  const cpu = payload.cpu;
  const memory = payload.memory;
  const disks = payload.disks ?? [];

  const systemCard = system ? (
    <div class="pcinfo-card">
      <div class="pcinfo-card-header">SYSTEM</div>
      <div class="pcinfo-card-body">
        <PcInfoRow label="Platform" value={system.platform ?? 'N/A'} />
        <PcInfoRow label="Hostname" value={system.hostname ?? 'N/A'} />
        <PcInfoRow label="Uptime" value={formatUptime(system.uptime)} />
      </div>
    </div>
  ) : null;

  const cpuCard = cpu ? (
    <div class="pcinfo-card">
      <div class="pcinfo-card-header">CPU</div>
      <div class="pcinfo-card-body">
        <div class="pcinfo-title">{cpu.model ?? 'Unknown CPU'}</div>
        <PcInfoRow
          label="Topology"
          value={`${cpu.cores ?? 'N/A'} cores / ${cpu.threads ?? 'N/A'} threads`}
        />
        <PcInfoUsageBar
          label="Usage"
          percent={cpu.usage}
          detail={cpu.usage !== null ? 'Current load' : undefined}
        />
      </div>
    </div>
  ) : null;

  const memoryCard = memory ? (
    <div class="pcinfo-card">
      <div class="pcinfo-card-header">MEMORY</div>
      <div class="pcinfo-card-body">
        <PcInfoUsageBar
          label="Usage"
          percent={memory.usagePercent}
          detail={
            memory.totalBytes
              ? `${formatBytes(memory.usedBytes ?? 0)} / ${formatBytes(memory.totalBytes)}`
              : 'N/A'
          }
        />
        <PcInfoRow
          label="Free"
          value={memory.freeBytes !== null ? formatBytes(memory.freeBytes) : 'N/A'}
        />
      </div>
    </div>
  ) : null;

  const diskCard = disks.length > 0 ? (
    <div class="pcinfo-card">
      <div class="pcinfo-card-header">DISK</div>
      <div class="pcinfo-card-body">
        {disks.map((disk) => (
          <div class="pcinfo-disk">
            <div class="pcinfo-title">{disk.path}</div>
            <PcInfoUsageBar
              label="Usage"
              percent={disk.usagePercent}
              detail={
                disk.totalBytes
                  ? `${formatBytes(disk.usedBytes ?? 0)} / ${formatBytes(disk.totalBytes)}`
                  : 'N/A'
              }
            />
            <PcInfoRow
              label="Free"
              value={disk.freeBytes !== null ? formatBytes(disk.freeBytes) : 'N/A'}
            />
          </div>
        ))}
      </div>
    </div>
  ) : null;

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

export const buildPcInfoCompactCard = (payload: PcInfoPayload): PcInfoCompactCard | null => {
  const cpu = payload.cpu;
  if (cpu) {
    const title = cpu.model ?? 'Unknown CPU';
    const subtitle = `${cpu.cores ?? 'N/A'} cores / ${cpu.threads ?? 'N/A'} threads`;
    return {
      label: 'CPU',
      title,
      subtitle,
      body: (
        <div class="pcinfo-compact">
          <PcInfoUsageBar label="Usage" percent={cpu.usage} detail={cpu.usage !== null ? 'Current load' : undefined} />
        </div>
      ),
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
      body: (
        <div class="pcinfo-compact">
          <PcInfoUsageBar
            label="Usage"
            percent={memory.usagePercent}
            detail={
              memory.totalBytes
                ? `${formatBytes(memory.usedBytes ?? 0)} / ${formatBytes(memory.totalBytes)}`
                : 'N/A'
            }
          />
          <PcInfoRow label="Free" value={memory.freeBytes !== null ? formatBytes(memory.freeBytes) : 'N/A'} />
        </div>
      ),
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
      body: (
        <div class="pcinfo-compact">
          {disk ? (
            <>
              <PcInfoUsageBar
                label="Usage"
                percent={disk.usagePercent}
                detail={
                  disk.totalBytes
                    ? `${formatBytes(disk.usedBytes ?? 0)} / ${formatBytes(disk.totalBytes)}`
                    : 'N/A'
                }
              />
              <PcInfoRow label="Free" value={disk.freeBytes !== null ? formatBytes(disk.freeBytes) : 'N/A'} />
            </>
          ) : null}
        </div>
      ),
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
      body: (
        <div class="pcinfo-compact">
          <PcInfoRow label="Platform" value={system.platform ?? 'N/A'} />
          <PcInfoRow label="Hostname" value={system.hostname ?? 'N/A'} />
          <PcInfoRow label="Uptime" value={formatUptime(system.uptime)} />
        </div>
      ),
    };
  }

  return null;
};

export const PcInfoPanel: Component<{ payload: PcInfoPayload }> = (props) => {
  const sections = buildPcInfoSections(props.payload);

  return (
    <div class="pcinfo-panel">
      {sections.systemCard}
      {sections.cpuCard}
      {sections.memoryCard}
      {sections.diskCard}
    </div>
  );
};

