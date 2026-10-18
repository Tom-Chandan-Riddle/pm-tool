import styles from './App.module.css';
import { ProjectsFeature } from './features/projects/ProjectsFeature';
import { ErrorBoundary } from './shared/ErrorBoundary';

export function App() {
  return (
    <main className={styles.shell}>
      <h1>PM Tool</h1>
      <ErrorBoundary>
        <ProjectsFeature />
      </ErrorBoundary>
    </main>
  );
}
