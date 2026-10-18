import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addProject, editProject, listProjects, removeProject } from './projectsApi';
import type { ProjectInput } from './projects.types';

const PROJECTS_KEY = ['projects'] as const;

export function useProjects() {
  return useQuery({ queryKey: PROJECTS_KEY, queryFn: listProjects });
}

function useProjectMutation<Variables>(mutationFn: (variables: Variables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useAddProject() {
  return useProjectMutation((input: ProjectInput) => addProject(input));
}

export function useEditProject() {
  return useProjectMutation((variables: { id: string; input: ProjectInput }) =>
    editProject(variables.id, variables.input),
  );
}

export function useRemoveProject() {
  return useProjectMutation((id: string) => removeProject(id));
}
