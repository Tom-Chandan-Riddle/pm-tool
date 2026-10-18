import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { stubProjectsApi, withQueryClient } from './fakeProjectsApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the application heading', async () => {
    stubProjectsApi([]);
    render(withQueryClient(<App />));
    expect(screen.getByRole('heading', { name: 'PM Tool' })).toBeInTheDocument();
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
  });
});
