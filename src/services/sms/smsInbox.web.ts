/**
 * Web build: there is no SMS inbox in a browser. Every call degrades to
 * "unavailable" so the tracking service and screens behave exactly as on a
 * device without the native reader module — the paste-import path remains.
 */
export interface InboxSms {
  id: string;
  address: string;
  body: string;
  /** epoch ms */
  date: number;
}

export async function hasSmsPermission(): Promise<boolean> {
  return false;
}

export async function requestSmsPermission(): Promise<boolean> {
  return false;
}

export function isSmsReaderAvailable(): boolean {
  return false;
}

export async function getSmsInbox(_maxCount = 50): Promise<InboxSms[]> {
  return [];
}
