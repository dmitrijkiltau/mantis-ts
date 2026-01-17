import { invoke as tauriInvoke } from '@tauri-apps/api/core';

type InvokeArgs = Record<string, unknown> | undefined;

export const invoke = async <T = unknown>(
  command: string,
  args?: InvokeArgs,
): Promise<T> => {
  return tauriInvoke<T>(command, args);
};
