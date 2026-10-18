import { LiveIndicator } from './LiveIndicator';
import { SnapshotSummary } from './SnapshotSummary';
import { useLiveSnapshot } from './useLiveSnapshot';
import styles from './live.module.css';

/** Follows the selected project's files live. Shows nothing when no project is selected. */
export function LiveFeature({ projectId }: { readonly projectId: string | null }) {
  if (projectId === null) return null;
  // Keyed by id, so choosing another project drops the old stream and starts from Connecting.
  return <LiveProject key={projectId} projectId={projectId} />;
}

function LiveProject({ projectId }: { readonly projectId: string }) {
  const { query, status } = useLiveSnapshot(projectId);

  return (
    <section aria-label="Live project view" className={styles.view}>
      <LiveIndicator status={status} />
      {query.data ? (
        <SnapshotSummary snapshot={query.data} />
      ) : query.isError ? (
        <div role="alert">
          <p>Could not load the snapshot: {query.error.message}</p>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <p>Loading snapshot…</p>
      )}
    </section>
  );
}
