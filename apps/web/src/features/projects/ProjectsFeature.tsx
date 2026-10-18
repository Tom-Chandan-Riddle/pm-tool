import { ProjectsPanel } from './ProjectsPanel';
import { ProjectSwitcher } from './ProjectSwitcher';
import { useProjects } from './useProjects';
import { useSelectedProjectId } from './useSelectedProjectId';

/** Loads the project list, then shows the switcher and the manage panel. */
export function ProjectsFeature() {
  const projects = useProjects();
  const [selectedId, select] = useSelectedProjectId();

  if (projects.isPending) return <p role="status">Loading projects…</p>;
  if (projects.isError) {
    return (
      <div role="alert">
        <p>Could not load projects: {projects.error.message}</p>
        <button type="button" onClick={() => void projects.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  // A stored id can outlive its project, so only an id in the list counts as selected.
  const validSelectedId = projects.data.some((project) => project.id === selectedId)
    ? selectedId
    : null;

  return (
    <>
      <ProjectSwitcher projects={projects.data} selectedId={validSelectedId} onSelect={select} />
      <ProjectsPanel projects={projects.data} selectedId={validSelectedId} onSelect={select} />
    </>
  );
}
