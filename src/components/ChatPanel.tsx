import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, ApiError, postStream } from "../api/client";
import { Message, ProjectFile } from "../lib/types";
import {
  FileIcon,
  FolderFilesIcon,
  LogoMark,
  PaperclipIcon,
  SendIcon,
  SpinnerIcon,
  XIcon,
} from "./icons";

// Code element styling lives in index.css (see the `.prose pre` / inline-code
// rules) because stacked prose-* variants for nested `pre code` are unreliable.
const PROSE_CLASSES =
  "prose prose-sm max-w-none prose-p:my-1.5 prose-p:leading-relaxed prose-headings:mt-3 " +
  "prose-headings:mb-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-a:text-indigo-600";

export default function ChatPanel({ projectId }: { projectId: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [existingFiles, setExistingFiles] = useState<ProjectFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<ProjectFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<Message[]>(`/projects/${projectId}/messages`),
      api.get<ProjectFile[]>(`/projects/${projectId}/files`),
    ])
      .then(([msgs, files]) => {
        setMessages(msgs);
        setExistingFiles(files);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploaded = await api.post<ProjectFile>(`/projects/${projectId}/files`, form);
      setExistingFiles((prev) => [uploaded, ...prev]);
      setPendingFiles((prev) => [...prev, uploaded]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "File upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function togglePending(file: ProjectFile) {
    setPendingFiles((prev) =>
      prev.some((f) => f.id === file.id) ? prev.filter((f) => f.id !== file.id) : [...prev, file]
    );
  }

  function removePending(id: number) {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const attachedFiles = pendingFiles;
    setInput("");
    setPendingFiles([]);
    setShowLibrary(false);
    setError(null);
    setSending(true);
    requestAnimationFrame(autoResize);

    // Optimistically render the user's message plus an empty assistant bubble
    // that fills in as tokens stream. Temp ids are swapped for real ones on
    // the user_message / done events.
    const tempUserId = Date.now();
    const tempAssistantId = tempUserId + 1;
    const optimisticUser: Message = {
      id: tempUserId,
      role: "user",
      content: text,
      attachments: attachedFiles.map((f) => f.filename),
      created_at: new Date().toISOString(),
    };
    const streamingAssistant: Message = {
      id: tempAssistantId,
      role: "assistant",
      content: "",
      attachments: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
    setStreamingId(tempAssistantId);

    try {
      await postStream(
        `/projects/${projectId}/chat/stream`,
        { message: text, file_ids: attachedFiles.map((f) => f.id) },
        (evt) => {
          if (evt.type === "user_message") {
            const real = evt.message as Message;
            setMessages((prev) => prev.map((m) => (m.id === tempUserId ? real : m)));
          } else if (evt.type === "delta") {
            setMessages((prev) =>
              prev.map((m) => (m.id === tempAssistantId ? { ...m, content: m.content + evt.text } : m))
            );
          } else if (evt.type === "done") {
            const real = evt.message as Message;
            setMessages((prev) => prev.map((m) => (m.id === tempAssistantId ? real : m)));
          } else if (evt.type === "error") {
            throw new ApiError(502, evt.detail);
          }
        }
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempUserId && m.id !== tempAssistantId));
      setInput(text);
      setPendingFiles(attachedFiles);
      setError(err instanceof ApiError ? err.message : "Failed to send message.");
    } finally {
      setStreamingId(null);
      setSending(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <SpinnerIcon className="h-4 w-4" /> Loading conversation…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-center">
              <LogoMark className="mb-4 h-10 w-10" />
              <p className="text-base font-semibold text-slate-700">Start the conversation</p>
              <p className="mt-1 text-sm text-slate-400">Say hello, or attach a file for the agent to look at.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[70%] rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white shadow-sm">
                      {m.attachments.length > 0 && (
                        <div className="mb-1.5 flex flex-wrap gap-1.5">
                          {m.attachments.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs text-white"
                            >
                              <FileIcon className="h-3 w-3" />
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-3">
                    <LogoMark className="mt-0.5 h-6 w-6 shrink-0" />
                    <div className={`${PROSE_CLASSES} min-w-0 flex-1 text-slate-800`}>
                      {m.id === streamingId && m.content === "" ? (
                        <div className="flex items-center gap-1 py-1.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300 [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300" />
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.id === streamingId ? m.content + " ▍" : m.content}
                        </ReactMarkdown>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          {error && (
            <div className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {pendingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingFiles.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 py-1 pl-2.5 pr-1.5 text-xs font-medium text-indigo-700"
                >
                  <FileIcon className="h-3 w-3" />
                  {f.filename}
                  <button
                    type="button"
                    onClick={() => removePending(f.id)}
                    className="rounded-full p-0.5 hover:bg-indigo-100"
                  >
                    <XIcon className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {showLibrary && existingFiles.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 rounded-xl bg-slate-50 p-2.5">
              {existingFiles.map((f) => {
                const active = pendingFiles.some((p) => p.id === f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => togglePending(f)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-indigo-300 bg-indigo-100 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <FileIcon className="h-3 w-3" />
                    {f.filename}
                  </button>
                );
              })}
            </div>
          )}

          <form
            onSubmit={handleSend}
            className="flex items-end gap-1.5 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-sm transition focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/10"
          >
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} disabled={uploading} className="hidden" />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload a file"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              {uploading ? <SpinnerIcon className="h-4 w-4" /> : <PaperclipIcon className="h-4.5 w-4.5" />}
            </button>

            {existingFiles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLibrary((v) => !v)}
                title="Attach an existing file"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
                  showLibrary ? "bg-indigo-50 text-indigo-600" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <FolderFilesIcon className="h-4.5 w-4.5" />
              </button>
            )}

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message your agent…"
              rows={1}
              disabled={sending}
              className="max-h-40 flex-1 resize-none border-0 bg-transparent px-1.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-50"
            />

            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-1.5 px-1 text-xs text-slate-400">Shift+Enter for a new line</p>
        </div>
      </div>
    </div>
  );
}
