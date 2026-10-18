import { useState } from 'react';
import { ProjectForm } from './ProjectForm';
import { useAddProject, useEditProject, useRemoveProject } from './useProjects';
import type { ProjectView } from './projects.types';
import styles from './projects.module.css';

interface ProjectsPanelProps {
  readonly projects: readonly ProjectView[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string | null) => void;
}

export function ProjectsPanel({ projects, selectedId, onSelect }: ProjectsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null);
  const [addFormVersion, setAddFormVersion] = useState(0);
  const addProject = useAddProject();
  const editProject = useEditProject();
  const removeProject = useRemoveProject();

  // Looked up on every render, so a project removed elsewhere closes its own edit form.
  const editing = projects.find((project) => project.id === editingId);

  const startEditing = (id: string) => {
    addProject.reset();
    editProject.reset();
    setEditingId(id);
  };

  const stopEditing = () => {
    editProject.reset();
    setEditingId(null);
  };

  const startRemoval = (id: string) => {
    removeProject.reset();
    setConfirmingRemovalId(id);
  };

  const confirmRemoval = (id: string) => {
    removeProject.mutate(id, {
      onSuccess: () => {
        setConfirmingRemovalId(null);
        if (id === selectedId) onSelect(null);
      },
    });
  };

  return (
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Projects</h2>
      {projects.length === 0 && <p>No projects yet. Add one below.</p>}
      <ul className={styles.list}>
        {projects.map((project) => (
          <li key={project.id}>
            <strong>{project.name}</strong>
            {project.id === selectedId && <span className={styles.badge}> selected</span>}
            {project.fileStatus === 'missing' && (
              <span className={styles.warning}> file not found</span>
            )}
            <div className={styles.path}>{project.featuresPath}</div>
            <div className={styles.actions}>
              <button
                type="button"
                onClick={() => {
                  onSelect(project.id);
                }}
              >
                Select {project.name}
              </button>
              <button
                type="button"
                onClick={() => {
                  startEditing(project.id);
                }}
              >
                Edit {project.name}
              </button>
              {confirmingRemovalId === project.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      confirmRemoval(project.id);
                    }}
                  >
                    Yes, remove {project.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingRemovalId(null);
                    }}
                  >
                    Cancel removal
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    startRemoval(project.id);
                  }}
                >
                  Remove {project.name}
                </button>
              )}
            </div>
            {confirmingRemovalId === project.id && removeProject.error && (
              <p role="alert" className={styles.error}>
                {removeProject.error.message}
              </p>
            )}
          </li>
        ))}
      </ul>

      {editing ? (
        <>
          <h3>Edit {editing.name}</h3>
          <ProjectForm
            key={editing.id}
            initial={editing}
            submitLabel="Save changes"
            isPending={editProject.isPending}
            error={editProject.error}
            onCancel={stopEditing}
            onSubmit={(input) => {
              editProject.mutate({ id: editing.id, input }, { onSuccess: stopEditing });
            }}
          />
        </>
      ) : (
        <>
          <h3>Add a project</h3>
          <ProjectForm
            key={addFormVersion}
            submitLabel="Add project"
            isPending={addProject.isPending}
            error={addProject.error}
            onSubmit={(input) => {
              addProject.mutate(input, {
                onSuccess: () => {
                  setAddFormVersion((v) => v + 1);
                },
              });
            }}
          />
        </>
      )}
    </section>
  );
}
