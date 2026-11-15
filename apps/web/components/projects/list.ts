import type { Project } from '@askwell/shared';

/** The list after a create: appended, matching the server's oldest-first order. */
export function addProject(list: readonly Project[], project: Project): Project[] {
  return [...list.filter((p) => p.id !== project.id), project];
}

/** The list after a rename: the server's copy replaces the old row in place. */
export function replaceProject(list: readonly Project[], project: Project): Project[] {
  return list.map((p) => (p.id === project.id ? project : p));
}

/** The list after a delete. */
export function removeProject(list: readonly Project[], id: string): Project[] {
  return list.filter((p) => p.id !== id);
}
