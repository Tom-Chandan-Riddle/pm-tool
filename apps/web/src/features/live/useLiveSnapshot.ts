import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { eventsUrl, fetchSnapshot, parseSnapshotEvent } from './liveApi';

// A41
export type LiveStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'unreadable';

const SNAPSHOT_EVENT = 'snapshot';

function snapshotKey(projectId: string) {
  return ['snapshot', projectId] as const;
}

/**
 * The project's snapshot: loaded once through the query, then replaced by every event the
 * server pushes. The component using it is keyed by project id, so a switch starts fresh.
 */
export function useLiveSnapshot(projectId: string) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  const query = useQuery({
    queryKey: snapshotKey(projectId),
    queryFn: () => fetchSnapshot(projectId),
    staleTime: Infinity,
  });

  useEffect(() => {
    const source = new EventSource(eventsUrl(projectId));
    source.onopen = () => {
      setStatus('live');
    };
    source.onerror = () => {
      // A closed stream will not be retried by the browser, an open or connecting one will.
      setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'reconnecting');
    };
    source.addEventListener(SNAPSHOT_EVENT, (event) => {
      const snapshot = event instanceof MessageEvent ? parseSnapshotEvent(event.data) : undefined;
      if (!snapshot) {
        source.close();
        setStatus('unreadable');
        return;
      }
      queryClient.setQueryData(snapshotKey(projectId), snapshot);
    });
    return () => {
      source.close();
    };
  }, [projectId, queryClient]);

  return { query, status };
}
