import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import ChatPanel from "../components/ChatPanel";
import { ArrowLeftIcon, SettingsIcon, SpinnerIcon } from "../components/icons";
import Modal from "../components/Modal";
import Navbar from "../components/Navbar";
import PromptsPanel from "../components/PromptsPanel";
import { Project } from "../lib/types";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const id = Number(projectId);

  const [project, setProject] = useState<Project | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Project>(`/projects/${id}`)
      .then(setProject)
      .catch(() => setError("Project not found."));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-red-700">{error}</p>
          <Link to="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
            Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <Navbar />

      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="Back to projects"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-slate-900">{project?.name ?? "…"}</h1>
              {project && (
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {project.model}
                </span>
              )}
            </div>
            {project?.description && <p className="truncate text-xs text-slate-400">{project.description}</p>}
          </div>
        </div>

        <button
          onClick={() => setShowPrompt(true)}
          disabled={!project}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          Prompt
        </button>
      </div>

      {project ? (
        <ChatPanel projectId={project.id} />
      ) : (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
          <SpinnerIcon className="h-4 w-4" /> Loading…
        </div>
      )}

      {showPrompt && project && (
        <Modal title="System prompt" onClose={() => setShowPrompt(false)}>
          <PromptsPanel projectId={project.id} />
        </Modal>
      )}
    </div>
  );
}
