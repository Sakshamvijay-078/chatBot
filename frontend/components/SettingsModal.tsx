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
const MAX_DOC_BYTES = 10_000_000;

const SPRING_POP = { type: "spring" as const, stiffness: 320, damping: 22, mass: 0.8 };

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { session, profile, refreshProfile } = useAuth();
  const token = session?.access_token ?? "";

  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [style, setStyle] = useState(profile?.style ?? "");
  const [expertise, setExpertise] = useState(profile?.expertise_level ?? "intermediate");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [keyMsg, setKeyMsg] = useState("");
  const [keySaving, setKeySaving] = useState(false);
  const [keyRemoved, setKeyRemoved] = useState(false);

  const [models, setModels] = useState<GroqModel[]>([]);
  const [selectedModel, setSelectedModel] = useState(profile?.preferred_model ?? "openai/gpt-oss-20b");
  const [modelSaving, setModelSaving] = useState(false);

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

  async function saveModel() {
    setModelSaving(true);
    try { await updateProfile(token, { preferred_model: selectedModel }); await refreshProfile(); }
    finally { setModelSaving(false); }
  }

  function handleDocFileClick() { setDocError(null); docFileRef.current?.click(); }

  async function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > MAX_DOC_BYTES) {
      setDocError(`File too large (max ${(MAX_DOC_BYTES / 1_000_000).toFixed(0)} MB).`);
      return;
    }
    setDocUploading(true); setDocError(null);
    try {
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
    { id: "profile", label: "Profile",   icon: <User      className="w-3.5 h-3.5" /> },
    { id: "api",     label: "API Key",   icon: <Key       className="w-3.5 h-3.5" /> },
    { id: "model",   label: "Model",     icon: <Cpu       className="w-3.5 h-3.5" /> },
    { id: "docs",    label: "Documents", icon: <FolderOpen className="w-3.5 h-3.5" /> },
  ];

  // Shared input style
  const inputStyle: React.CSSProperties = {
    background: "#1E1E1E",
    border: "1px solid #2A2A2A",
    color: "#F5F5F5",
    borderRadius: 9,
    padding: "9px 13px",
    fontSize: 14,
    outline: "none",
    width: "100%",
    transition: "border-color 0.18s",
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="w-full max-w-lg mx-4 overflow-hidden"
            style={{
              background: "#161616",
              border: "1px solid #2A2A2A",
              borderRadius: 12,
            }}
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={SPRING_POP}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid #2A2A2A" }}
            >
              <div className="flex items-center gap-2.5">
                <Sliders className="w-4 h-4" style={{ color: "#C8F31D" }} />
                <h2 className="font-semibold text-[15px]" style={{ color: "#F5F5F5" }}>Settings</h2>
              </div>
              <button
                id="close-settings-btn"
                onClick={onClose}
                className="p-1.5 rounded-md transition-colors"
                style={{ color: "#555555" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F5F5")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div
              className="flex gap-1 px-4 pt-4 pb-2 overflow-x-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors whitespace-nowrap flex-shrink-0"
                  style={{
                    background: activeTab === tab.id ? "rgba(200,243,29,0.08)" : "transparent",
                    border: `1px solid ${activeTab === tab.id ? "rgba(200,243,29,0.25)" : "transparent"}`,
                    color: activeTab === tab.id ? "#C8F31D" : "#9A9A9A",
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="px-6 py-5 overflow-y-auto" style={{ minHeight: 300, maxHeight: "60vh" }}>
              <AnimatePresence mode="wait">

                {/* ── Profile ── */}
                {activeTab === "profile" && (
                  <motion.form key="profile" onSubmit={saveProfile}
                    className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#555555" }}>
                        Display Name
                      </label>
                      <input
                        className="input-base"
                        placeholder="Your name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        style={inputStyle}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#555555" }}>
                        Expertise Level
                      </label>
                      <select
                        value={expertise}
                        onChange={(e) => setExpertise(e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced / Expert</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#555555" }}>
                        Response Style
                      </label>
                      <textarea
                        rows={3}
                        placeholder="e.g. Be concise and use bullet points."
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        style={{ ...inputStyle, resize: "none" }}
                      />
                    </div>
                    {profileMsg && (
                      <p className="text-sm" style={{ color: profileMsg.type === "success" ? "#C8F31D" : "#f87171" }}>
                        {profileMsg.text}
                      </p>
                    )}
                    <button type="submit" disabled={profileSaving}
                      className="btn-lime flex items-center justify-center gap-2 h-10">
                      {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}
                    </button>
                  </motion.form>
                )}

                {/* ── API Key ── */}
                {activeTab === "api" && (
                  <motion.div key="api" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                    {profile?.has_byok ? (
                      <div className="flex items-center justify-between px-4 py-3 rounded-md"
                        style={{ background: "rgba(200,243,29,0.06)", border: "1px solid rgba(200,243,29,0.2)" }}>
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4" style={{ color: "#C8F31D" }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: "#C8F31D" }}>BYOK Active</p>
                            <p className="text-xs" style={{ color: "#9A9A9A" }}>Your Groq key is saved.</p>
                          </div>
                        </div>
                        <button onClick={handleRemoveKey}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ color: "#555555" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}>
                          {keyRemoved ? <Check className="w-4 h-4" style={{ color: "#C8F31D" }} /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="px-4 py-3 rounded-md text-sm" style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", color: "#9A9A9A" }}>
                        You are on the <span style={{ color: "#F5F5F5", fontWeight: 600 }}>Trial plan</span> (
                        {profile?.trial_tokens_used?.toLocaleString()} / {profile?.trial_token_limit?.toLocaleString()} tokens).
                        Add your own Groq key for unlimited usage.
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#555555" }}>
                        Groq API Key
                      </label>
                      <input id="groq-api-key-input" type="password"
                        placeholder="gsk_..."
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setKeyValid(null); setKeyMsg(""); }}
                        style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }}
                      />
                      <p className="text-[11px]" style={{ color: "#555555" }}>
                        Get a free key at{" "}
                        <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer"
                          style={{ color: "#C8F31D", textDecoration: "underline dotted" }}>
                          console.groq.com
                        </a>
                      </p>
                    </div>
                    {keyMsg && (
                      <div className="flex items-center gap-2 text-sm px-3 py-2.5 rounded-md"
                        style={{
                          background: keyValid ? "rgba(200,243,29,0.06)" : "rgba(239,68,68,0.06)",
                          border: `1px solid ${keyValid ? "rgba(200,243,29,0.2)" : "rgba(239,68,68,0.2)"}`,
                          color: keyValid ? "#C8F31D" : "#f87171",
                        }}>
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
                        className="btn-lime flex items-center gap-2 flex-1 justify-center h-10">
                        {keySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Key"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Model ── */}
                {activeTab === "model" && (
                  <motion.div key="model" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                    {!profile?.has_byok && (
                      <div className="px-4 py-3 rounded-md text-sm"
                        style={{ background: "rgba(200,243,29,0.04)", border: "1px solid rgba(200,243,29,0.15)", color: "#C8F31D" }}>
                        ⚡ Model selection requires a BYOK key. Trial mode uses <strong>GPT-OSS 20B</strong>.
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5">
                      {(models.length ? models : [
                        { id: "llama-3.1-8b-instant",                     name: "Llama 3.1 8B ⚡ (Fast)" },
                        { id: "llama-3.3-70b-versatile",                  name: "Llama 3.3 70B 💪 (Powerful)" },
                        { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
                        { id: "openai/gpt-oss-120b",                      name: "GPT-OSS 120B (Largest)" },
                        { id: "openai/gpt-oss-20b",                       name: "GPT-OSS 20B (Balanced)" },
                        { id: "qwen/qwen3-32b",                           name: "Qwen3 32B 🐉 (Code)" },
                        { id: "groq/compound",                            name: "Groq Compound (Multi-step)" },
                        { id: "groq/compound-mini",                       name: "Groq Compound Mini" },
                        { id: "mixtral-8x7b-32768",                       name: "Mixtral 8x7B (32K)" },
                        { id: "gemma2-9b-it",                             name: "Gemma 2 9B" },
                      ]).map((m) => (
                        <button key={m.id} id={`model-${m.id}`} type="button"
                          disabled={!profile?.has_byok}
                          onClick={() => setSelectedModel(m.id)}
                          className="flex items-center justify-between px-4 py-2.5 rounded-md text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: selectedModel === m.id ? "rgba(200,243,29,0.06)" : "transparent",
                            border: `1px solid ${selectedModel === m.id ? "rgba(200,243,29,0.25)" : "#2A2A2A"}`,
                            color: selectedModel === m.id ? "#C8F31D" : "#9A9A9A",
                          }}>
                          <span>{m.name}</span>
                          {selectedModel === m.id && <Check className="w-4 h-4 flex-shrink-0" style={{ color: "#C8F31D" }} />}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={saveModel}
                      disabled={!profile?.has_byok || modelSaving}
                      className="btn-lime flex items-center justify-center gap-2 h-10">
                      {modelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Model Preference"}
                    </button>
                  </motion.div>
                )}

                {/* ── Documents ── */}
                {activeTab === "docs" && (
                  <motion.div key="docs" className="flex flex-col gap-4"
                    initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.16 }}>
                    <div className="px-4 py-3 rounded-md text-sm"
                      style={{ background: "#1E1E1E", border: "1px solid #2A2A2A", color: "#9A9A9A" }}>
                      <p className="font-medium mb-1" style={{ color: "#F5F5F5" }}>Global Documents</p>
                      These files are automatically injected as context into <em>every</em> chat.
                      Max 10 documents · 12,000 characters each.
                    </div>

                    <input ref={docFileRef} type="file" accept={ACCEPTED_TYPES}
                      className="hidden" onChange={handleDocFile} />
                    <button type="button" onClick={handleDocFileClick}
                      disabled={docUploading || docs.length >= 10}
                      className="btn-ghost flex items-center justify-center gap-2 h-10">
                      {docUploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
                        : <><Upload className="w-4 h-4" /> Upload Document</>}
                    </button>
                    <p className="text-[11px] text-center -mt-2" style={{ color: "#555555" }}>
                      .txt .md .csv .json .py .js .ts .html .yaml .pdf · max 10 MB
                    </p>

                    {docError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-md text-sm"
                        style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" /> {docError}
                      </div>
                    )}

                    {docsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#555555" }} />
                      </div>
                    ) : docs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center">
                        <FolderOpen className="w-10 h-10 mb-2" style={{ color: "#2A2A2A" }} />
                        <p className="text-sm" style={{ color: "#555555" }}>No global documents yet</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {docs.map((doc) => (
                          <motion.div key={doc.id} layout
                            className="flex items-center gap-3 px-3.5 py-2.5 rounded-md"
                            style={{ background: "#1E1E1E", border: "1px solid #2A2A2A" }}>
                            <FileText className="w-4 h-4 flex-shrink-0" style={{ color: "#C8F31D" }} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm truncate" style={{ color: "#F5F5F5" }}>{doc.name}</p>
                              <p className="text-[11px]" style={{ color: "#555555" }}>
                                {(doc.size_bytes / 1024).toFixed(1)} KB · {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                            <button onClick={() => handleDeleteDoc(doc.id)}
                              className="p-1.5 rounded-md transition-colors flex-shrink-0"
                              style={{ color: "#555555" }}
                              onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                              onMouseLeave={(e) => (e.currentTarget.style.color = "#555555")}>
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
