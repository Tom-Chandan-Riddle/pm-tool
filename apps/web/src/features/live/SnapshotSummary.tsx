import type { ProjectSnapshot } from '@pm-tool/shared';

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

// A42: a stand-in until the F04 board shows the snapshot.
export function SnapshotSummary({ snapshot }: { readonly snapshot: ProjectSnapshot }) {
  if (snapshot.featuresFile === 'missing') {
    return <p>FEATURES.md was not found in this project's folder.</p>;
  }
  const { features } = snapshot.features;
  const tasks = features.flatMap((feature) => feature.tasks);
  const doneTasks = tasks.filter((task) => task.ticked).length;
  const parts = [
    plural(features.length, 'feature'),
    `${String(doneTasks)} of ${plural(tasks.length, 'task')} done`,
  ];
  if (snapshot.warnings.length > 0) parts.push(plural(snapshot.warnings.length, 'warning'));
  return <p>{parts.join(' · ')}</p>;
}
