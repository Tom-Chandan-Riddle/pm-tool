import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { problem, stubProjectsApi, withQueryClient } from './fakeProjectsApi';

const pmTool = {
  id: 'p1',
  name: 'PM Tool',
  featuresPath: 'C:/work/pm-tool/FEATURES.md',
  fileStatus: 'ok',
} as const;
const shop = {
  id: 'p2',
  name: 'Shop',
  featuresPath: 'C:/work/shop/FEATURES.md',
  fileStatus: 'missing',
} as const;

function renderApp() {
  render(withQueryClient(<App />));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loading the projects', () => {
  it('shows a loading message while the list is on its way', () => {
    vi.stubGlobal('fetch', () => new Promise(() => undefined));
    renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects');
  });

  it('shows an empty state when there are no projects', async () => {
    stubProjectsApi([]);
    renderApp();
    expect(await screen.findByText(/No projects yet/)).toBeInTheDocument();
  });

  it('shows an error and a retry button when the list fails to load', async () => {
    let failing = true;
    stubProjectsApi([pmTool], ({ method }) =>
      failing && method === 'GET' ? problem(500, { title: 'Internal Server Error' }) : undefined,
    );
    renderApp();
    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('Could not load projects: Internal Server Error');

    failing = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('PM Tool', { selector: 'strong' })).toBeInTheDocument();
  });

  it('lists projects and marks a project whose file is missing', async () => {
    stubProjectsApi([pmTool, shop]);
    renderApp();
    expect(await screen.findByText('PM Tool', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getAllByText(/file not found/)).toHaveLength(1);
  });
});

describe('adding a project', () => {
  it('adds a project, shows it in the list and clears the form', async () => {
    stubProjectsApi([]);
    renderApp();
    await screen.findByText(/No projects yet/);

    await userEvent.type(screen.getByLabelText('Name'), '  Billing ');
    await userEvent.type(
      screen.getByLabelText('Path to FEATURES.md'),
      'C:/work/billing/FEATURES.md',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));

    expect(await screen.findByText('Billing', { selector: 'strong' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Name')).toHaveValue('');
    });
  });

  it('shows the server message when the path is not a features file', async () => {
    stubProjectsApi([], ({ method }) =>
      method === 'POST'
        ? problem(422, { title: 'Invalid features file', detail: 'Cannot read a file at C:/x.md' })
        : undefined,
    );
    renderApp();
    await screen.findByText(/No projects yet/);

    await userEvent.type(screen.getByLabelText('Name'), 'Ghost');
    await userEvent.type(screen.getByLabelText('Path to FEATURES.md'), 'C:/x.md');
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot read a file at C:/x.md');
    expect(screen.getByLabelText('Name')).toHaveValue('Ghost');
  });

  it('shows field errors next to the inputs on a 400', async () => {
    stubProjectsApi([], ({ method }) =>
      method === 'POST'
        ? problem(400, {
            title: 'Invalid request',
            errors: [
              { field: 'name', message: 'Name is required' },
              { field: 'featuresPath', message: 'Path to FEATURES.md is required' },
            ],
          })
        : undefined,
    );
    renderApp();
    await screen.findByText(/No projects yet/);

    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Path to FEATURES.md is required')).toBeInTheDocument();
  });
});

describe('editing a project', () => {
  it('renames a project', async () => {
    stubProjectsApi([pmTool]);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit PM Tool' }));

    const nameInput = screen.getByLabelText('Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Dashboard');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Dashboard', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('keeps the form open and shows the message when the save is rejected', async () => {
    stubProjectsApi([pmTool], ({ method }) =>
      method === 'PUT'
        ? problem(422, { title: 'Invalid', detail: 'No feature heading' })
        : undefined,
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No feature heading');
  });
});

describe('removing a project', () => {
  it('asks for confirmation, then removes the project', async () => {
    stubProjectsApi([pmTool, shop]);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Shop' }));
    expect(screen.getByText('Shop', { selector: 'strong' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove Shop' }));

    await waitFor(() => {
      expect(screen.queryByText('Shop', { selector: 'strong' })).not.toBeInTheDocument();
    });
  });

  it('keeps the project when removal is cancelled', async () => {
    stubProjectsApi([pmTool]);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel removal' }));

    expect(screen.getByText('PM Tool', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove PM Tool' })).toBeInTheDocument();
  });

  it('shows an error when the project is already gone', async () => {
    stubProjectsApi([pmTool], ({ method }) =>
      method === 'DELETE'
        ? problem(404, { title: 'Project not found', detail: 'No project with id p1' })
        : undefined,
    );
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Remove PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove PM Tool' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No project with id p1');
  });

  it('clears the selection when the selected project is removed', async () => {
    stubProjectsApi([pmTool]);
    localStorage.setItem('pm-tool.selectedProjectId', 'p1');
    renderApp();
    const switcher = await screen.findByLabelText('Project');
    expect(switcher).toHaveValue('p1');

    await userEvent.click(screen.getByRole('button', { name: 'Remove PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove PM Tool' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('');
    });
    expect(localStorage.getItem('pm-tool.selectedProjectId')).toBeNull();
  });
});

describe('switching projects', () => {
  it('selects a project from the switcher and remembers it', async () => {
    stubProjectsApi([pmTool, shop]);
    renderApp();
    await userEvent.selectOptions(await screen.findByLabelText('Project'), 'Shop');

    expect(screen.getByLabelText('Project')).toHaveValue('p2');
    expect(localStorage.getItem('pm-tool.selectedProjectId')).toBe('p2');
  });

  it('restores the remembered project after a reload', async () => {
    stubProjectsApi([pmTool, shop]);
    localStorage.setItem('pm-tool.selectedProjectId', 'p2');
    renderApp();
    expect(await screen.findByLabelText('Project')).toHaveValue('p2');
  });

  it('selects nothing when the remembered project no longer exists', async () => {
    stubProjectsApi([pmTool]);
    localStorage.setItem('pm-tool.selectedProjectId', 'deleted');
    renderApp();
    expect(await screen.findByLabelText('Project')).toHaveValue('');
  });
});

describe('state that goes stale', () => {
  it('closes the edit form when its project is removed from the row', async () => {
    stubProjectsApi([pmTool]);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit PM Tool' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove PM Tool' }));

    expect(await screen.findByRole('button', { name: 'Add project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('closes the edit form when a refetch shows the project is gone', async () => {
    const { serverProjects } = stubProjectsApi([pmTool, shop]);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit PM Tool' }));

    serverProjects.splice(0, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Shop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove Shop' }));

    expect(await screen.findByRole('button', { name: 'Add project' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('shows nothing selected when a refetch no longer has the selected project', async () => {
    const { serverProjects } = stubProjectsApi([pmTool, shop]);
    localStorage.setItem('pm-tool.selectedProjectId', 'p1');
    renderApp();
    expect(await screen.findByLabelText('Project')).toHaveValue('p1');

    serverProjects.splice(0, 1);
    await userEvent.click(screen.getByRole('button', { name: 'Remove Shop' }));
    await userEvent.click(screen.getByRole('button', { name: 'Yes, remove Shop' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Project')).toHaveValue('');
    });
  });

  it('forgets an old add error after the user opens edit and comes back', async () => {
    stubProjectsApi([pmTool], ({ method }) =>
      method === 'POST'
        ? problem(422, { title: 'Invalid', detail: 'No feature heading' })
        : undefined,
    );
    renderApp();
    await screen.findByText('PM Tool', { selector: 'strong' });
    await userEvent.type(screen.getByLabelText('Name'), 'Ghost');
    await userEvent.type(screen.getByLabelText('Path to FEATURES.md'), 'C:/x.md');
    await userEvent.click(screen.getByRole('button', { name: 'Add project' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No feature heading');

    await userEvent.click(screen.getByRole('button', { name: 'Edit PM Tool' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
