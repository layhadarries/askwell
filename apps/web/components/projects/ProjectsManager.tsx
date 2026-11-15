'use client';

import type { Project } from '@askwell/shared';
import { useState } from 'react';
import { EmptyState, GlassPanel } from '../ui';
import { CreateProjectForm } from './CreateProjectForm';
import { addProject, removeProject, replaceProject } from './list';
import { ProjectRow } from './ProjectRow';

export const EMPTY_TITLE = 'No projects yet';
export const EMPTY_DESCRIPTION =
  'Projects you create show up here. Each one gets its own bot, knowledge and widget.';

/** The Projects page body: create form plus the list. Starts from the server-rendered list. */
export function ProjectsManager({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const onCreated = (p: Project) => setProjects((list) => addProject(list, p));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      {/* One stable spot for the form: going to or from an empty list never remounts it. */}
      <GlassPanel>
        <CreateProjectForm onCreated={onCreated} />
      </GlassPanel>
      {projects.length === 0 ? (
        <EmptyState title={EMPTY_TITLE} description={EMPTY_DESCRIPTION} />
      ) : (
        <GlassPanel>
          <ul aria-label="Your projects" className="flex flex-col">
            {projects.map((p) => (
              <ProjectRow
                key={p.id}
                project={p}
                onRenamed={(updated) => setProjects((list) => replaceProject(list, updated))}
                onDeleted={(id) => setProjects((list) => removeProject(list, id))}
              />
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}
