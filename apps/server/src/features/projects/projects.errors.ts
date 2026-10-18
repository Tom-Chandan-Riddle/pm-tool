import { ProblemError } from '../../shared/errors.js';

export class ProjectNotFoundError extends ProblemError {
  constructor(id: string) {
    super(404, 'Project not found', `No project with id ${id}`);
  }
}

export class InvalidProjectFileError extends ProblemError {
  constructor(reason: string) {
    super(422, 'Invalid features file', reason);
  }
}
