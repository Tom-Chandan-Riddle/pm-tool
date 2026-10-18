export interface Project {
  readonly id: string;
  readonly name: string;
  readonly featuresPath: string;
}

export interface ProjectView extends Project {
  readonly fileStatus: 'ok' | 'missing';
}

export type ProjectInput = Omit<Project, 'id'>;

export interface FieldError {
  readonly field: string;
  readonly message: string;
}
