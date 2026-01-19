import type { JSX } from 'solid-js';

export type BubbleFilePayload = {
  action: 'file';
  path: string;
  content: string;
  truncated?: boolean;
};

export type BubbleDirectoryEntry = {
  name: string;
  type: 'file' | 'directory' | 'other';
  sizeBytes?: number | null;
};

export type BubbleDirectoryPayload = {
  action: 'directory';
  path: string;
  entries: BubbleDirectoryEntry[];
  truncated?: boolean;
};

export type BubbleSearchMatch = {
  path: string;
  type: 'file' | 'directory';
};

export type BubbleSearchPayload = {
  root: string;
  query: string;
  matches: BubbleSearchMatch[];
  truncated?: boolean;
};

export type ProcessInfo = {
  pid: number;
  name: string;
  cpu: number | null;
  memoryBytes: number | null;
  runtimeSeconds: number | null;
  command: string | null;
};

export type ProcessListResult = {
  action: 'list';
  total: number;
  truncated: boolean;
  processes: ProcessInfo[];
};

export type PcInfoSystem = {
  platform: string;
  hostname: string | null;
  uptime: number | null;
};

export type PcInfoCpu = {
  cores: number | null;
  threads: number | null;
  model: string | null;
  usage: number | null;
};

export type PcInfoMemory = {
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usagePercent: number | null;
};

export type PcInfoDisk = {
  path: string;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usagePercent: number | null;
};

export type PcInfoPayload = {
  system?: PcInfoSystem;
  cpu?: PcInfoCpu;
  memory?: PcInfoMemory;
  disks?: PcInfoDisk[];
};

export type PcInfoSections = {
  systemCard: JSX.Element | null;
  cpuCard: JSX.Element | null;
  memoryCard: JSX.Element | null;
  diskCard: JSX.Element | null;
  primaryCount: number;
  totalCount: number;
};

export type FileTreeRow = {
  name: string;
  kind: 'file' | 'folder' | 'other';
  depth: number;
  path?: string;
  sizeBytes?: number | null;
  itemCount?: number;
};
