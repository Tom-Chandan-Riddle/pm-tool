import { useState } from 'react';

const STORAGE_KEY = 'pm-tool.selectedProjectId';

// A15: the choice is a per-browser convenience, so storage failures are tolerated.
function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Blocked storage: the selection then lasts until the page reloads.
  }
}

export function useSelectedProjectId() {
  const [selectedId, setSelectedId] = useState<string | null>(readStoredId);
  const select = (id: string | null) => {
    setSelectedId(id);
    storeId(id);
  };
  return [selectedId, select] as const;
}
