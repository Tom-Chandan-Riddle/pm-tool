import { useState, type SubmitEvent } from 'react';
import { ApiError } from './projectsApi';
import type { ProjectInput } from './projects.types';
import styles from './projects.module.css';

interface ProjectFormProps {
  readonly initial?: ProjectInput;
  readonly submitLabel: string;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onSubmit: (input: ProjectInput) => void;
  readonly onCancel?: () => void;
}

function fieldMessage(error: Error | null, field: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  return error.fieldErrors.find((fieldError) => fieldError.field === field)?.message;
}

export function ProjectForm({
  initial,
  submitLabel,
  isPending,
  error,
  onSubmit,
  onCancel,
}: ProjectFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [featuresPath, setFeaturesPath] = useState(initial?.featuresPath ?? '');

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ name: name.trim(), featuresPath: featuresPath.trim() });
  };

  const nameMessage = fieldMessage(error, 'name');
  const pathMessage = fieldMessage(error, 'featuresPath');
  const hasFieldErrors = nameMessage !== undefined || pathMessage !== undefined;

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <label>
        Name
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </label>
      {nameMessage && (
        <p role="alert" className={styles.error}>
          {nameMessage}
        </p>
      )}
      <label>
        Path to FEATURES.md
        <input
          value={featuresPath}
          onChange={(event) => {
            setFeaturesPath(event.target.value);
          }}
        />
      </label>
      {pathMessage && (
        <p role="alert" className={styles.error}>
          {pathMessage}
        </p>
      )}
      {error && !hasFieldErrors && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" disabled={isPending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
