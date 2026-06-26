"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Key, Check, AlertCircle, Loader2, Trash2, Cpu, User, Sliders, Zap,
  FileText, Upload, FolderOpen,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  validateGroqKey, updateProfile, removeGroqKey, getModels,
  listDocuments, uploadDocument, removeDocument,
} from "@/lib/api";
import { Document, GroqModel } from "@/types";
import clsx from "clsx";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "profile" | "api" | "model" | "docs";

const ACCEPTED_TYPES = ".txt,.md,.csv,.json,.py,.js,.ts,.tsx,.jsx,.html,.xml,.yaml,.yml,.pdf";
const MAX_DOC_BYTES = 10_000_000; // 10 MB — backend handles PDF extraction

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { session, profile, refreshProfile } = useAuth();
  const token = session?.access_token ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("profile");

  // Profile tab
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [style, setStyle] = useState(profile?.style ?? "");
  const [expertise, setExpertise] = useState(profile?.expertise_level ?? "intermediate");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // API key tab
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyMsg, setKeyMsg] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyRemoved, setKeyRemoved] = useState(false);

  // Model tab
  const [models, setModels] = useState<GroqModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(profile?.preferred_model ?? "openai/gpt-oss-20b");
  const [modelSaving, setModelSaving] = useState(false);

  // Documents tab
  const [docs, setDocs] = useState<Document[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile?.display_name ?? "");
    setStyle(profile?.style ?? "");
    setExpertise(profile?.expertise_level ?? "intermediate");
    setSelectedModel(profile?.preferred_model ?? "openai/gpt-oss-20b");
    setProfileMsg(null);
    setKeyValid(null);
    setKeyMsg("");
    setApiKey("");
    getModels().then(setModels).catch(() => {});
  }, [open, profile]);

  useEffect(() => {
    if (open && activeTab === "docs") loadDocs();
  }, [open, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDocs() {
    if (!token) return;
    setDocsLoading(true);
    try { setDocs(await listDocuments(token)); } finally { setDocsLoading(false); }
  }

  // ── Profile ────────────────────────────────────────────────
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileSaving(true); setProfileMsg(null);
    try {
      await updateProfile(token, { display_name: displayName, style, expertise_level: expertise });
      await refreshProfile();
      setProfileMsg({ type: "success", text: "Profile saved!" });
    } catch (err: unknown) {
      setProfileMsg({ type: "error", text: err instanceof Error ? err.message : "Failed to save." });
    } finally { setProfileSaving(false); }
  }

  // ── BYOK ──────────────────────────────────────────────────
  async function handleValidate() {
    if (!apiKey.trim()) return;
    setValidating(true); setKeyValid(null); setKeyMsg("");
    try {
      const res = await validateGroqKey(token, apiKey.trim());
      setKeyValid(res.valid); setKeyMsg(res.message);
    } catch { setKeyValid(false); setKeyMsg("Validation failed. Try again."); }
    finally { setValidating(false); }
  }

  async function handleSaveKey() {
    if (!keyValid || !apiKey.trim()) return;
    setKeySaving(true);
    try {
      await updateProfile(token, { groq_api_key: apiKey.trim() });
      await refreshProfile();
      setKeyMsg("✓ Key saved! BYOK mode is now active.");
      setApiKey(""); setKeyValid(null);
    } catch { setKeyMsg("Failed to save key."); }
    finally { setKeySaving(false); }
  }

  async function handleRemoveKey() {
    try {
      await removeGroqKey(token); await refreshProfile();
      setKeyRemoved(true); setTimeout(() => setKeyRemoved(false), 2000);
    } catch { /* ignore */ }
  }

  // ── Model ─────────────────────────────────────────────────
  async function saveModel() {
    setModelSaving(true);
    try { await updateProfile(token, { preferred_model: selectedModel }); await refreshProfile(); }
    finally { setModelSaving(false); }
  }

  // ── Documents ─────────────────────────────────────────────
  function handleDocFileClick() { setDocError(null); docFileRef.current?.click(); }

  async function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (file.size > MAX_DOC_BYTES) {
      setDocError(`File too large (max ${(MAX_DOC_BYTES / 1_000_000).toFixed(0)} MB). This file is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    setDocUploading(true); setDocError(null);
    try {
      // New API: send raw File object — backend uploads to Supabase Storage
      // and extracts text (including PDF OCR) server-side
      await uploadDocument(token, file);
      await loadDocs();
    } catch (err: unknown) {
      setDocError(err instanceof Error ? err.message : "Upload failed.");
    } finally { setDocUploading(false); }
  }

  async function handleDeleteDoc(docId: string) {
    try { await removeDocument(token, docId); await loadDocs(); }
    catch { /* ignore */ }
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile",   icon: <User className="w-3.5 h-3.5" /> },
    { id: "api",     label: "API Key",   icon: <Key className="w-3.5 h-3.5" /> },
    { id: "model",   label: "Model",     icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: "docs",    label: "Documents", icon: <FolderOpen className="w-3.5 h-3.5" /> },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            className="w-full max-w-lg mx-4 glass-strong rounded-2xl shadow-glass overflow-hidden"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: "rgba(255,255,255,0.07)" }}
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-penda-400" />
                <h2 className="text-white font-semibold text-base">Settings</h2>
              </div>
              <button
                id="close-settings-btn"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs — overflow-x-auto prevents overflow on small screens */}
            <div
              className="flex gap-1 px-4 pt-4 pb-2 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                    "transition-all duration-150 whitespace-nowrap flex-shrink-0",
                    activeTab === tab.id
                      ? "bg-penda-600/20 text-penda-300 border border-penda-500/25"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  )}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="px-6 py-5 overflow-y-auto" style={{ minHeight: 300, maxHeight: "65vh" }}>
              <AnimatePresence mode="wait">

                {/* ── Profile ── */}
                {activeTab === "profile" && (
                  <motion.form key="profile" onSubmit={saveProfile} className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Display Name</label>
                      <input className="input-base" placeholder="Your name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Expertise Level</label>
                      <select className="input-base" value={expertise} onChange={(e) => setExpertise(e.target.value)}>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced / Expert</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Response Style</label>
                      <textarea className="input-base resize-none" rows={3}
                        placeholder="e.g. Be concise and use bullet points. Include code examples where relevant."
                        value={style} onChange={(e) => setStyle(e.target.value)} />
                    </div>
                    {profileMsg && (
                      <p className={`text-sm ${profileMsg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
                        {profileMsg.text}
                      </p>
                    )}
                    <button type="submit" disabled={profileSaving} className="btn-primary flex items-center justify-center gap-2 h-10">
                      {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}
                    </button>
                  </motion.form>
                )}

                {/* ── API Key ── */}
                {activeTab === "api" && (
                  <motion.div key="api" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}>
                    {profile?.has_byok ? (
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-emerald-400" />
                          <div>
                            <p className="text-emerald-400 text-sm font-medium">BYOK Active</p>
                            <p className="text-zinc-500 text-xs">Your Groq key is saved.</p>
                          </div>
                        </div>
                        <button onClick={handleRemoveKey}
                          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all">
                          {keyRemoved ? <Check className="w-4 h-4 text-emerald-400" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-400">
                        You are on the <span className="text-white font-medium">Trial plan</span> ({" "}
                        {profile?.trial_tokens_used?.toLocaleString()} / {profile?.trial_token_limit?.toLocaleString()} tokens used).
                        Add your own Groq key for unlimited usage.
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Groq API Key</label>
                      <input id="groq-api-key-input" className="input-base font-mono text-xs" type="password"
                        placeholder="gsk_..." value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); setKeyMsg(""); }} />
                      <p className="text-xs text-zinc-600">
                        Get a free key at{" "}
                        <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-penda-400 hover:underline">
                          console.groq.com
                        </a>
                      </p>
                    </div>
                    {keyMsg && (
                      <div className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
                        keyValid ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                 : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {keyValid ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                        {keyMsg}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button id="validate-key-btn" type="button" onClick={handleValidate}
                        disabled={!apiKey.trim() || validating}
                        className="btn-ghost flex items-center gap-2 flex-1 justify-center h-10">
                        {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Validate Key"}
                      </button>
                      <button id="save-key-btn" type="button" onClick={handleSaveKey}
                        disabled={!keyValid || keySaving}
                        className="btn-primary flex items-center gap-2 flex-1 justify-center h-10">
                        {keySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Key"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Model ── */}
                {activeTab === "model" && (
                  <motion.div key="model" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}>
                    {!profile?.has_byok && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                        ⚡ Model selection requires a BYOK key. Trial mode uses <strong>GPT-OSS 20B</strong>.
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      {(models.length ? models : [
                        { id: "llama-3.1-8b-instant",                     name: "Llama 3.1 8B ⚡ (Fast, Default)" },
                        { id: "llama-3.3-70b-versatile",                  name: "Llama 3.3 70B 💪 (Powerful)" },
                        { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B 🦇" },
                        { id: "openai/gpt-oss-120b",                      name: "GPT-OSS 120B (Largest)" },
                        { id: "openai/gpt-oss-20b",                       name: "GPT-OSS 20B (Balanced)" },
                        { id: "qwen/qwen3-32b",                           name: "Qwen3 32B 🐉 (Code)" },
                        { id: "qwen/qwen3.6-27b",                         name: "Qwen3.6 27B" },
                        { id: "groq/compound",                            name: "Groq Compound (Multi-step)" },
                        { id: "groq/compound-mini",                       name: "Groq Compound Mini" },
                        { id: "mixtral-8x7b-32768",                       name: "Mixtral 8x7B (32K context)" },
                        { id: "gemma2-9b-it",                             name: "Gemma 2 9B" },
                        { id: "allam-2-7b",                               name: "Allam 2 7B (🇸🇦 Arabic)" },
                      ]).map((m) => (
                        <button key={m.id} id={`model-${m.id}`} type="button"
                          disabled={!profile?.has_byok}
                          onClick={() => setSelectedModel(m.id)}
                          className={clsx(
                            "flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-all text-left",
                            selectedModel === m.id
                              ? "bg-penda-600/20 border-penda-500/40 text-white"
                              : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
                            "disabled:opacity-40 disabled:cursor-not-allowed"
                          )}>
                          <span>{m.name}</span>
                          {selectedModel === m.id && <Check className="w-4 h-4 text-penda-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={saveModel} disabled={!profile?.has_byok || modelSaving}
                      className="btn-primary flex items-center justify-center gap-2 h-10">
                      {modelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Model Preference"}
                    </button>
                  </motion.div>
                )}

                {/* ── Documents ── */}
                {activeTab === "docs" && (
                  <motion.div key="docs" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}>

                    {/* Info banner */}
                    <div className="p-3.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-400">
                      <p className="font-medium text-zinc-300 mb-1">Global Documents</p>
                      These files are automatically injected as context into <em>every</em> chat.
                      Perfect for a resume, company brief, or personal notes.
                      Max 10 documents · 12,000 characters each.
                    </div>

                    {/* Upload button */}
                    <input ref={docFileRef} type="file" accept={ACCEPTED_TYPES} className="hidden"
                      onChange={handleDocFile} />
                    <button type="button" onClick={handleDocFileClick}
                      disabled={docUploading || docs.length >= 10}
                      className="btn-ghost flex items-center justify-center gap-2 h-10">
                      {docUploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                        : <><Upload className="w-4 h-4" /> Upload Document</>
                      }
                    </button>
                    <p className="text-xs text-zinc-600 -mt-2 text-center">
                      Supports: .txt .md .csv .json .py .js .ts .html .yaml .pdf · max 10 MB
                    </p>

                    {/* Error */}
                    {docError && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400"
                        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {docError}
                      </div>
                    )}

                    {/* Document list */}
                    {docsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-zinc-600" />
                      </div>
                    ) : docs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <FolderOpen className="w-10 h-10 text-zinc-700 mb-2" />
                        <p className="text-zinc-500 text-sm">No global documents yet</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {docs.map((doc) => (
                          <motion.div key={doc.id} layout
                            className="flex items-center gap-3 px-3.5 py-3 rounded-xl border"
                            style={{ background: "rgba(20,20,28,0.8)", borderColor: "rgba(255,255,255,0.07)" }}>
                            <FileText className="w-4 h-4 text-penda-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-zinc-200 truncate">{doc.name}</p>
                              <p className="text-xs text-zinc-600">
                                {(doc.size_bytes / 1024).toFixed(1)} KB ·{" "}
                                {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <button onClick={() => handleDeleteDoc(doc.id)}
                              className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
