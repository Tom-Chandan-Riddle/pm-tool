import type { LiveStatus } from './useLiveSnapshot';
import styles from './live.module.css';

const LABELS: Record<LiveStatus, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  reconnecting: 'Reconnecting…',
  offline: 'Offline',
  unreadable: 'Live updates unreadable',
};

export function LiveIndicator({ status }: { readonly status: LiveStatus }) {
  return (
    <p role="status" className={[styles.indicator, styles[status]].join(' ')}>
      {LABELS[status]}
    </p>
  );
}
