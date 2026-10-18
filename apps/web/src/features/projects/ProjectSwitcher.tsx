import type { ChangeEvent } from 'react';
import type { ProjectView } from './projects.types';

interface ProjectSwitcherProps {
  readonly projects: readonly ProjectView[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}

export function ProjectSwitcher({ projects, selectedId, onSelect }: ProjectSwitcherProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSelect(event.target.value === '' ? null : event.target.value);
  };
  return (
    <label>
      Project{' '}
      <select value={selectedId ?? ''} onChange={handleChange}>
        <option value="">No project selected</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </label>
  );
}
