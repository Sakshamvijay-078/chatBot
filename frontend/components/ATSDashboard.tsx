"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  Upload, FileText, Briefcase, Sparkles, ChevronRight,
  Loader2, CheckCircle, XCircle, Clock, Users, Star,
  Trash2, ArrowLeft, AlertCircle, Target,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  runATS, uploadATSResume, listATSCandidates,
  updateATSCandidateStatus, deleteATSCandidate, getATSCandidateDetail,
} from "@/lib/api";
import { ATSCandidate, ATSCandidateDetail, ATSStatus } from "@/types";
import ReactMarkdown from "react-markdown";

const SPRING = { type: "spring" as const, stiffness: 260, damping: 22, mass: 0.9 };
const SPRING_POP = { type: "spring" as const, stiffness: 320, damping: 20 };

const STATUS_CONFIG: Record<ATSStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:     { label: "Pending",     color: "#a1a1aa", bg: "rgba(161,161,170,0.1)", icon: <Clock className="w-3 h-3" /> },
  analyzed:    { label: "Analyzed",    color: "#60a5fa", bg: "rgba(96,165,250,0.1)",  icon: <Sparkles className="w-3 h-3" /> },
  rejected:    { label: "Rejected",    color: "#f87171", bg: "rgba(248,113,113,0.1)", icon: <XCircle className="w-3 h-3" /> },
  shortlisted: { label: "Shortlisted", color: "#34d399", bg: "rgba(52,211,153,0.1)",  icon: <CheckCircle className="w-3 h-3" /> },
  hired:       { label: "Hired",       color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  icon: <Star className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: ATSStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171";
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-20 h-20">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle cx="40" cy="40" r="32" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${(pct / 100) * 201} 201`}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-white">{score}%</span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color }}>ATS Score</span>
    </div>
  );
}

// ── Candidate Card ──────────────────────────────────────────
function CandidateCard({ candidate, onSelect, onDelete }: {
  candidate: ATSCandidate;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={SPRING}
      className="group relative p-4 rounded-xl cursor-pointer transition-all"
      style={{
        background: "rgba(20,20,28,0.8)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.2)",
      }}
      whileHover={{ borderColor: "rgba(124,58,237,0.3)", boxShadow: "0 4px 24px rgba(124,58,237,0.08)" }}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(200,243,29,0.12)", border: "1px solid rgba(200,243,29,0.2)" }}>
            <Users className="w-4 h-4 text-[#C8F31D]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{candidate.name || "Unknown Candidate"}</p>
            <p className="text-xs text-zinc-500 truncate">{candidate.email || "No email"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {candidate.ats_score != null && (
            <span className="text-sm font-bold" style={{
              color: candidate.ats_score >= 75 ? "#34d399" : candidate.ats_score >= 50 ? "#fbbf24" : "#f87171"
            }}>
              {candidate.ats_score}%
            </span>
          )}
          <StatusBadge status={candidate.status} />
        </div>
      </div>

      {/* Missing keywords preview */}
      {candidate.missing_keywords?.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {candidate.missing_keywords.slice(0, 4).map((kw) => (
            <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] text-zinc-400"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {kw}
            </span>
          ))}
          {candidate.missing_keywords.length > 4 && (
            <span className="text-[10px] text-zinc-600">+{candidate.missing_keywords.length - 4} more</span>
          )}
        </div>
      )}

      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-md flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-400/10"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            className="absolute inset-0 rounded-xl flex items-center justify-center gap-2 z-10"
            style={{ background: "rgba(9,9,11,0.92)", backdropFilter: "blur(4px)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-sm text-zinc-300 mr-1">Delete?</span>
            <button onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="px-3 py-1 rounded-lg text-xs font-medium text-white bg-red-500/80 hover:bg-red-500 transition-colors">
              Yes
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-3 py-1 rounded-lg text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.07)" }}>
              No
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Detail Panel ──────────────────────────────────────────
function CandidateDetailPanel({ candidate, onBack, onStatusChange }: {
  candidate: ATSCandidateDetail;
  onBack: () => void;
  onStatusChange: (status: ATSStatus) => void;
}) {
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleStatusChange(status: ATSStatus) {
    setUpdatingStatus(true);
    await onStatusChange(status);
    setUpdatingStatus(false);
  }

  return (
    <motion.div
      className="flex flex-col h-full overflow-y-auto"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={SPRING}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">{candidate.name || "Unknown Candidate"}</h2>
          <p className="text-xs text-zinc-500">{candidate.email}</p>
        </div>
        {candidate.ats_score != null && <ScoreGauge score={candidate.ats_score} />}
      </div>

      {/* Status selector */}
      <div className="p-4 pb-0">
        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Pipeline Status</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_CONFIG) as ATSStatus[]).map((s) => (
            <button
              key={s}
              disabled={updatingStatus}
              onClick={() => handleStatusChange(s)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
              style={{
                background: candidate.status === s ? STATUS_CONFIG[s].bg : "rgba(255,255,255,0.04)",
                color: candidate.status === s ? STATUS_CONFIG[s].color : "#71717a",
                border: `1px solid ${candidate.status === s ? STATUS_CONFIG[s].color + "40" : "rgba(255,255,255,0.07)"}`,
              }}
            >
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Missing keywords */}
      {candidate.missing_keywords?.length > 0 && (
        <div className="p-4 pb-0">
          <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Missing Keywords</p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.missing_keywords.map((kw) => (
              <span key={kw} className="px-2 py-0.5 rounded-md text-xs text-red-300"
                style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)" }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Critique */}
      <div className="p-4 pb-0">
        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">ATS Critique</p>
        <div className="p-3.5 rounded-xl text-sm text-zinc-300 leading-relaxed"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="prose-penda">
            <ReactMarkdown>{candidate.critique}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* Refined bullets */}
      <div className="p-4">
        <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Optimized Bullet Points</p>
        <div className="p-3.5 rounded-xl text-sm text-zinc-200 leading-relaxed"
          style={{ background: "rgba(200,243,29,0.05)", border: "1px solid rgba(200,243,29,0.15)" }}>
          <div className="prose-penda">
            <ReactMarkdown>{candidate.refined_bullets}</ReactMarkdown>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main ATSDashboard ──────────────────────────────────────
export default function ATSDashboard() {
  const { session } = useAuth();
  const token = session?.access_token ?? "";

  const [tab, setTab] = useState<"analyze" | "candidates">("analyze");
  const [resumeText, setResumeText] = useState("");
  const [jobDesc, setJobDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ critique: string; refined_bullets: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ATSCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<ATSCandidateDetail | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);

  // Dropzone for resume
  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadATSResume(token, file);
      setResumeText(res.resume_text);
      setUploadedFilename(res.filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to upload resume.");
    } finally {
      setUploading(false);
    }
  }, [token]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] },
    maxFiles: 1,
    disabled: uploading || analyzing,
  });

  async function handleAnalyze() {
    if (!resumeText.trim() || !jobDesc.trim()) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const res = await runATS(token, resumeText, jobDesc);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleLoadCandidates() {
    setLoadingCandidates(true);
    try {
      const list = await listATSCandidates(token);
      setCandidates(list);
    } catch { /* ignore */ }
    finally { setLoadingCandidates(false); }
  }

  async function handleSelectCandidate(id: string) {
    try {
      const { getATSCandidateDetail } = await import("@/lib/api");
      const detail = await getATSCandidateDetail(token, id);
      setSelectedCandidate(detail);
    } catch { /* ignore */ }
  }

  async function handleDeleteCandidate(id: string) {
    try {
      await deleteATSCandidate(token, id);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      if (selectedCandidate?.id === id) setSelectedCandidate(null);
    } catch { /* ignore */ }
  }

  async function handleStatusChange(status: ATSStatus) {
    if (!selectedCandidate) return;
    await updateATSCandidateStatus(token, selectedCandidate.id, status);
    setSelectedCandidate((prev) => prev ? { ...prev, status } : null);
    setCandidates((prev) => prev.map((c) => c.id === selectedCandidate.id ? { ...c, status } : c));
  }

  return (
    <div className="ats-layout">

      {/* Left: Analyze Panel */}
      <div className="ats-left-pane">
        {/* Tabs */}
        <div className="flex items-center gap-1 p-4 pb-0">
          {(["analyze", "candidates"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); if (t === "candidates") handleLoadCandidates(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all"
              style={{
                background: tab === t ? "rgba(200,243,29,0.15)" : "transparent",
                color: tab === t ? "#C8F31D" : "#71717a",
                border: tab === t ? "1px solid rgba(200,243,29,0.25)" : "1px solid transparent",
              }}>
              {t === "analyze" ? "Analyze Resume" : "Candidates"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            {tab === "analyze" ? (
              <motion.div key="analyze" className="space-y-4"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>

                {/* Resume upload dropzone */}
                <div>
                  <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-2 block">Resume (PDF or TXT)</label>
                  <div {...getRootProps()}
                    className="relative p-6 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all"
                    style={{
                      borderColor: isDragActive ? "rgba(200,243,29,0.6)" : "rgba(255,255,255,0.1)",
                      background: isDragActive ? "rgba(200,243,29,0.05)" : "rgba(255,255,255,0.02)",
                    }}>
                    <input {...getInputProps()} />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-6 h-6 text-penda-400 animate-spin" />
                        <p className="text-sm text-zinc-400">Uploading & extracting text…</p>
                      </div>
                    ) : uploadedFilename ? (
                      <div className="flex flex-col items-center gap-2">
                        <CheckCircle className="w-6 h-6 text-emerald-400" />
                        <p className="text-sm text-white font-medium">{uploadedFilename}</p>
                        <p className="text-xs text-zinc-500">Drop a new file to replace</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="w-6 h-6 text-zinc-500" />
                        <p className="text-sm text-zinc-400">Drop resume here or <span style={{ color: "#C8F31D" }}>browse</span></p>
                        <p className="text-xs text-zinc-600">PDF, TXT — max 20 MB</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Or paste text */}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider mb-2 block" style={{ color: "var(--text-secondary)" }}>Or paste resume text</label>
                  <textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste resume content here…"
                    rows={5}
                    className="input-base resize-none"
                    style={{ minHeight: 100 }}
                  />
                </div>

                {/* Job description */}
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                    <Briefcase className="w-3 h-3" /> Job Description
                  </label>
                  <textarea
                    value={jobDesc}
                    onChange={(e) => setJobDesc(e.target.value)}
                    placeholder="Paste the job description here…"
                    rows={5}
                    className="input-base resize-none"
                    style={{ minHeight: 100 }}
                  />
                </div>

                <AnimatePresence>{error && (
                  <motion.div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-sm text-red-400"
                    style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.18)" }}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
                  </motion.div>
                )}</AnimatePresence>

                <motion.button
                  onClick={handleAnalyze}
                  disabled={analyzing || !resumeText.trim() || !jobDesc.trim()}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
                  style={{ background: "#C8F31D", color: "#0A0A0A" }}>
                  {analyzing ? <><Loader2 className="w-4 h-4 animate-spin text-[#0A0A0A]" /> Analyzing…</> : <><Target className="w-4 h-4" /> Analyze with ATS AI</>}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div key="candidates" className="space-y-2"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-penda-400 animate-spin" /></div>
                ) : candidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <FileText className="w-8 h-8 text-zinc-700" />
                    <p className="text-sm text-zinc-500">No candidates yet. Analyze a resume to get started.</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {candidates.map((c) => (
                      <CandidateCard key={c.id} candidate={c}
                        onSelect={() => handleSelectCandidate(c.id)}
                        onDelete={() => handleDeleteCandidate(c.id)} />
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right: Results / Detail Panel */}
      <div className="ats-right-pane">
        <AnimatePresence mode="wait">
          {selectedCandidate ? (
            <CandidateDetailPanel key="detail"
              candidate={selectedCandidate}
              onBack={() => setSelectedCandidate(null)}
              onStatusChange={handleStatusChange} />
          ) : result ? (
            <motion.div key="result" className="flex flex-col h-full overflow-y-auto"
              initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={SPRING}>
              <div className="p-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" style={{ color: "#C8F31D" }} />
                  <h2 className="text-sm font-semibold text-white">ATS Analysis Results</h2>
                </div>
              </div>
              <div className="p-4 space-y-4 flex-1">
                <div className="p-3.5 rounded-xl" style={{ background: "var(--bg-card)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-2">Critique</p>
                  <div className="text-sm text-zinc-300 prose-penda"><ReactMarkdown>{result.critique}</ReactMarkdown></div>
                </div>
                <div className="p-3.5 rounded-xl" style={{ background: "rgba(200,243,29,0.05)", border: "1px solid rgba(200,243,29,0.15)" }}>
                   <p className="text-xs uppercase tracking-wider font-medium mb-2" style={{ color: "var(--lime)" }}>Optimized Bullets</p>
                   <div className="text-sm prose-penda" style={{ color: "var(--text-primary)" }}><ReactMarkdown>{result.refined_bullets}</ReactMarkdown></div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="empty" className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(200,243,29,0.08)", border: "1px solid rgba(200,243,29,0.15)" }}>
                <Target className="w-7 h-7" style={{ color: "#C8F31D" }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">ATS Results</h3>
                <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
                  Upload a resume and job description, then click &ldquo;Analyze&rdquo; to see your ATS score, missing keywords, and optimized bullets.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {[ChevronRight, ChevronRight, ChevronRight].map((Icon, i) => (
                  <motion.div key={i} animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}>
                    <Icon className="w-4 h-4 text-penda-500" />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
