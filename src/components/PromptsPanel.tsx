import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { Prompt } from "../lib/types";
import { SpinnerIcon } from "./icons";

export default function PromptsPanel({ projectId }: { projectId: number }) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    api
      .get<Prompt[]>(`/projects/${projectId}/prompts`)
      .then(setPrompts)
      .finally(() => setLoading(false));
  }

  useEffect(load, [projectId]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api.post<Prompt>(`/projects/${projectId}/prompts`, { content });
      setContent("");
      load();
    } finally {
      setSaving(false);
    }
  }

  const active = prompts.find((p) => p.is_active);
  const history = prompts.filter((p) => !p.is_active);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Active system prompt</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : active ? (
          <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-800">{active.content}</p>
        ) : (
          <p className="text-sm text-slate-500">No prompt set yet — the agent will use default behavior.</p>
        )}
      </div>

      <form onSubmit={handleSave}>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Set a new prompt</h3>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="You are a helpful assistant that…"
          className="mb-3 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving && <SpinnerIcon className="h-4 w-4" />}
          {saving ? "Saving…" : "Save as active prompt"}
        </button>
      </form>

      {history.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">History</h3>
          <ul className="space-y-2">
            {history.map((p) => (
              <li key={p.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                {p.content}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
