import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Video, FileText, Lock, FolderOpen, Search,
  Download, Trash2, Info, BookOpen, Share2, ExternalLink,
  Users, Eye, EyeOff, Cloud, CloudOff, RefreshCw, Film, FileCode
} from "lucide-react";
import { EducationalFile, StudentSubscription, PlatformConfig, SessionRecording } from "./types";
import LiveRoomsTab from "./components/LiveRoomsTab";
import CloudStorageTab from "./components/CloudStorageTab";
import RecordingsTab from "./components/RecordingsTab";

const INITIAL_COURSES: EducationalFile[] = [
  { id: "svt-1", title: "سلسلة تمارين الهضم والامتصاص الغذائي عند الإنسان 📝", fileName: "serie_digestion_7eme.pdf", fileSize: "2.4 MB", level: "السنة السابعة أساسي", stage: "preparatory", subject: "علوم الحياة والأرض (SVT)", description: "مجموعة من التمارين والمسائل النموذجية لاختبار الفهم السريع لمحور الهضم.", category: "exercise", isPremium: false, downloads: 142, uploadedAt: "2026-05-19" },
  { id: "svt-2", title: "ملخص كامل ومبسط لتكاثر الخلايا والانقسام الخلوي 🦠", fileName: "resume_mitose_bac_sciences.pdf", fileSize: "4.1 MB", level: "باكالوريا علوم تجريبية", stage: "secondary", subject: "علوم الحياة والأرض (SVT)", description: "درس تفاعلي مشفوع بالرسوم البيانية الملونة لتسهيل المراجعة للباكالوريا.", category: "summary", isPremium: true, downloads: 389, uploadedAt: "2026-05-20" },
  { id: "svt-3", title: "فرض مراقبة عدد 1 في العلوم الطبيعية - الثلاثي الأول 📊", fileName: "devoir_controle1_svt_9eme.pdf", fileSize: "1.8 MB", level: "السنة التاسعة أساسي", stage: "preparatory", subject: "علوم الحياة والأرض (SVT)", description: "النموذج الرسمي لفرض المراقبة والمرفق بالإصلاح والتقييم الذاتي.", category: "exam_prep", isPremium: true, downloads: 215, uploadedAt: "2026-05-21" },
  { id: "math-1", title: "مسائل في الحساب والمنطق الرياضي والعمليات الأساسية 🧠", fileName: "exercices_arithmetique_6eme.pdf", fileSize: "3.2 MB", level: "السنة السادسة ابتدائي", stage: "primary", subject: "رياضيات", description: "كراس المسائل المنهجية لتلاميذ التعليم الابتدائي.", category: "exercise", isPremium: false, downloads: 412, uploadedAt: "2026-05-18" },
  { id: "physics-1", title: "درس تفاعل النواة والنشاط الإشعاعي الاصطناعي 🧬", fileName: "cours_radioactivite_bac.pdf", fileSize: "5.5 MB", level: "باكالوريا علوم تجريبية", stage: "secondary", subject: "فيزياء وكيمياء", description: "مذكرة تفصيلية تشرح قوانين صودي وتطبيقات الاندماج والانشطار النووي.", category: "lesson", isPremium: true, downloads: 184, uploadedAt: "2026-05-21" },
];

const INITIAL_SUBS: StudentSubscription[] = [
  { id: "sub-1", firstName: "يوسف", lastName: "الهمامي", gradeLevel: "باكالوريا علوم تجريبية", status: "approved", createdAt: "2026-05-20 14:32" },
  { id: "sub-2", firstName: "أميرة", lastName: "بن علي", gradeLevel: "السنة التاسعة أساسي", status: "pending", createdAt: "2026-05-21 08:15" },
  { id: "sub-3", firstName: "سليم", lastName: "الدوزي", gradeLevel: "السنة السابعة أساسي", status: "pending", createdAt: "2026-05-21 10:45" },
];

const DEFAULT_CONFIG: PlatformConfig = {
  siteName: "أكاديمية دوز للعلوم الطبيعية 🇹🇳",
  teacherName: "الأستاذ فوزي بنبراهيم",
  welcomeMessage: "مستودعك التعليمي الحر والذكي لرفع ملفات الـ SVT والدروس التعليمية ومتابعة البث الحصري لولايات تونس مجاناً 🚀",
  d17Phone: "29464005",
  ccpAccount: "17001000000002006899",
  yearlyPriceTnd: 50,
  contactPhone: "29464005",
  svtSpecialtyText: "علوم الحياة والأرض (SVT)",
  megaLink: "https://mega.nz/folder/douz_svt_academy_backup_shared",
  googleDriveLink: "https://drive.google.com/drive/folders/1_SvtDouzAcademyPlaceholder",
  apkLink: "https://drive.google.com/drive/folders/1_SvtDouzAcademyPlaceholder",
};

type Tab = "home" | "library" | "live-rooms" | "cloud" | "recordings" | "subscriptions" | "admin-panel";
type SyncStatus = "idle" | "syncing" | "synced" | "error";

function simpleHash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString(16);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [courses, setCourses] = useState<EducationalFile[]>(() => { try { const s = localStorage.getItem("douz_courses"); return s ? JSON.parse(s) : INITIAL_COURSES; } catch { return INITIAL_COURSES; } });
  const [subscriptions, setSubscriptions] = useState<StudentSubscription[]>(() => { try { const s = localStorage.getItem("douz_subs"); return s ? JSON.parse(s) : INITIAL_SUBS; } catch { return INITIAL_SUBS; } });
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(() => { try { const s = localStorage.getItem("douz_config"); return s ? JSON.parse(s) : DEFAULT_CONFIG; } catch { return DEFAULT_CONFIG; } });
  const [recordings, setRecordings] = useState<SessionRecording[]>(() => { try { const s = localStorage.getItem("douz_recordings"); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [activeSubscriberSession, setActiveSubscriberSession] = useState<StudentSubscription | null>(() => { try { const s = localStorage.getItem("active_sub_session"); return s ? JSON.parse(s) : null; } catch { return null; } });

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStage, setFilterStage] = useState<"all" | "primary" | "preparatory" | "secondary">("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "lesson" | "exercise" | "exam_prep" | "summary">("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminTab, setAdminTab] = useState<"students" | "add-file" | "settings">("students");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [lockedFileToDownload, setLockedFileToDownload] = useState<EducationalFile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const syncIntervalRef = useRef<number | null>(null);

  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [regGrade, setRegGrade] = useState("باكالوريا علوم تجريبية");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [loginFirstName, setLoginFirstName] = useState("");
  const [loginLastName, setLoginLastName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginMode, setShowLoginMode] = useState(false);

  const [newFileTitle, setNewFileTitle] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [newFileStage, setNewFileStage] = useState<"primary" | "preparatory" | "secondary">("secondary");
  const [newFileGrade, setNewFileGrade] = useState("باكالوريا علوم");
  const [newFileSubject, setNewFileSubject] = useState("علوم الحياة والأرض (SVT)");
  const [newFileDesc, setNewFileDesc] = useState("");
  const [newFileCategory, setNewFileCategory] = useState<"lesson" | "exercise" | "exam_prep" | "summary">("lesson");
  const [newFileIsPremium, setNewFileIsPremium] = useState(false);

  useEffect(() => { localStorage.setItem("douz_courses", JSON.stringify(courses)); }, [courses]);
  useEffect(() => { localStorage.setItem("douz_subs", JSON.stringify(subscriptions)); }, [subscriptions]);
  useEffect(() => { localStorage.setItem("douz_config", JSON.stringify(platformConfig)); }, [platformConfig]);
  useEffect(() => { localStorage.setItem("douz_recordings", JSON.stringify(recordings)); }, [recordings]);
  useEffect(() => { if (activeSubscriberSession) localStorage.setItem("active_sub_session", JSON.stringify(activeSubscriberSession)); else localStorage.removeItem("active_sub_session"); }, [activeSubscriberSession]);

  const performSync = useCallback(async () => {
    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscribers: subscriptions, courses, config: platformConfig, lastSyncAt: new Date().toISOString() }) });
      if (res.ok) { setSyncStatus("synced"); setLastSyncTime(new Date().toLocaleTimeString("ar-TN")); setTimeout(() => setSyncStatus("idle"), 3000); }
      else { setSyncStatus("error"); setTimeout(() => setSyncStatus("idle"), 4000); }
    } catch { setSyncStatus("error"); setTimeout(() => setSyncStatus("idle"), 4000); }
  }, [subscriptions, courses, platformConfig]);

  useEffect(() => { syncIntervalRef.current = window.setInterval(performSync, 5 * 60 * 1000); return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); }; }, [performSync]);

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 4000); };

  const handleRegisterSubscription = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regFirstName.trim() || !regLastName.trim() || !regPassword.trim()) { showToast("⚠️ يرجى تعبئة الاسم واللقب وكلمة المرور!"); return; }
    if (regPassword !== regConfirmPassword) { showToast("⚠️ كلمة المرور وتأكيدها غير متطابقتين!"); return; }
    if (regPassword.length < 6) { showToast("⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل!"); return; }
    const exists = subscriptions.find(s => s.firstName.toLowerCase() === regFirstName.trim().toLowerCase() && s.lastName.toLowerCase() === regLastName.trim().toLowerCase());
    if (exists) { showToast("⚠️ هذا الاسم مسجل مسبقاً!"); return; }
    const newSub = { id: `sub-${Date.now()}`, firstName: regFirstName.trim(), lastName: regLastName.trim(), gradeLevel: regGrade, status: "pending" as const, createdAt: new Date().toISOString().replace("T", " ").substring(0, 16), passwordHash: simpleHash(regPassword) };
    setSubscriptions(prev => [newSub, ...prev]);
    showToast("🎉 تم تسجيل طلب الاشتراك! انتظر موافقة الأستاذ فوزي لتفعيل حسابك.");
    setRegFirstName(""); setRegLastName(""); setRegPassword(""); setRegConfirmPassword("");
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = subscriptions.find(s => s.firstName.toLowerCase() === loginFirstName.trim().toLowerCase() && s.lastName.toLowerCase() === loginLastName.trim().toLowerCase() && (s as StudentSubscription & { passwordHash?: string }).passwordHash === simpleHash(loginPassword));
    if (!user) { showToast("❌ بيانات الدخول غير صحيحة!"); return; }
    if (user.status === "pending") { showToast("⏳ حسابك لا يزال قيد المراجعة."); return; }
    if (user.status === "rejected") { showToast("❌ تم رفض طلب اشتراكك."); return; }
    setActiveSubscriberSession(user);
    showToast(`🔓 مرحباً ${user.firstName} ${user.lastName}!`);
    setLoginFirstName(""); setLoginLastName(""); setLoginPassword("");
  };

  const handleApproveSubscription = (id: string) => { setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, status: "approved" as const } : s)); showToast("✅ تم تفعيل الاشتراك!"); };
  const handleRejectSubscription = (id: string) => { setSubscriptions(prev => prev.map(s => s.id === id ? { ...s, status: "rejected" as const } : s)); showToast("❌ تم الرفض."); };
  const handleDeleteSubscription = (id: string) => { setSubscriptions(prev => prev.filter(s => s.id !== id)); showToast("🗑️ تم الحذف."); };

  const handleDownloadFile = (file: EducationalFile) => {
    const isUnlocked = !file.isPremium || isAdminLoggedIn || activeSubscriberSession?.status === "approved";
    if (!isUnlocked) { setLockedFileToDownload(file); return; }
    const blob = new Blob([`%PDF-1.4\nTitle: ${file.title}\n`], { type: "application/pdf" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = file.fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    setCourses(prev => prev.map(c => c.id === file.id ? { ...c, downloads: c.downloads + 1 } : c));
    showToast(`📥 جاري تحميل: ${file.title}`);
  };

  const handleAddNewDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileTitle.trim() || !newFileName.trim()) { showToast("⚠️ يرجى تحديد اسم الدرس والملف!"); return; }
    const newDoc: EducationalFile = { id: `file-${Date.now()}`, title: newFileTitle.trim(), fileName: newFileName.trim().endsWith(".pdf") ? newFileName.trim() : `${newFileName.trim()}.pdf`, fileSize: `${(Math.random() * 4 + 1.2).toFixed(1)} MB`, level: newFileGrade, stage: newFileStage, subject: newFileSubject, description: newFileDesc || "ملخص تعليمي مميز.", category: newFileCategory, isPremium: newFileIsPremium, downloads: 0, uploadedAt: new Date().toISOString().substring(0, 10) };
    setCourses(prev => [newDoc, ...prev]); showToast("✨ تم إدراج المستند بنجاح!");
    setNewFileTitle(""); setNewFileName(""); setNewFileDesc(""); setNewFileIsPremium(false);
  };

  const handleDeleteDocument = (id: string) => { setCourses(prev => prev.filter(c => c.id !== id)); showToast("🗑️ تم الحذف!"); };
  const handleUpdateConfig = (e: React.FormEvent) => { e.preventDefault(); showToast("⚙️ تم تحديث إعدادات المنصة!"); };
  const handleDeleteRecording = (id: string) => { setRecordings(prev => prev.filter(r => r.id !== id)); showToast("🗑️ تم حذف الحلقة."); };
  const handleSaveRecording = (rec: SessionRecording) => { setRecordings(prev => [rec, ...prev]); };

  const filteredCourses = courses.filter(item => {
    const matchSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || item.subject.toLowerCase().includes(searchQuery.toLowerCase()) || item.level.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch && (filterStage === "all" || item.stage === filterStage) && (filterCategory === "all" || item.category === filterCategory);
  });

  const syncBadge = { idle: null, syncing: { icon: <RefreshCw className="w-3 h-3 animate-spin" />, text: "جاري المزامنة...", cls: "bg-blue-50 text-blue-700 border-blue-200" }, synced: { icon: <Cloud className="w-3 h-3" />, text: `آخر مزامنة ${lastSyncTime}`, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }, error: { icon: <CloudOff className="w-3 h-3" />, text: "فشل الاتصال بالسحابة", cls: "bg-red-50 text-red-700 border-red-200" } }[syncStatus];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans" dir="rtl">
      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: -40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-4 left-4 right-4 md:left-auto md:w-96 z-50 bg-slate-900 border border-slate-700/60 text-white rounded-2xl p-4 shadow-2xl flex items-start gap-3 text-right">
            <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold shrink-0 mt-0.5 text-[10px]">✓</div>
            <div className="flex-1 text-xs">{toastMessage}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-gradient-to-r from-red-600 via-white to-red-600 h-1.5 w-full" />

      <div className="bg-slate-800 text-white px-4 py-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Cloud className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-300 font-medium">التزامن السحابي الآلي مفعّل</span>
          {syncBadge && <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${syncBadge.cls}`}>{syncBadge.icon} {syncBadge.text}</span>}
        </div>
        <button onClick={performSync} disabled={syncStatus === "syncing"} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded-lg text-[10px] transition-all disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${syncStatus === "syncing" ? "animate-spin" : ""}`} /> مزامنة الآن
        </button>
      </div>

      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-red-500 rounded-2xl flex items-center justify-center text-white font-black shadow-md relative border border-red-600 shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
              <span className="absolute -bottom-1 -right-1 bg-amber-400 text-slate-950 font-extrabold text-[9px] px-1.5 py-0.5 rounded-full border border-white">SVT</span>
            </div>
            <div className="text-right">
              <h1 className="font-extrabold text-base text-slate-900 leading-none">{platformConfig.siteName}</h1>
              <p className="text-xs text-red-600 font-bold mt-0.5 flex items-center gap-1">
                <span>بوابة الأستاذ فوزي بنبراهيم لكافة المستويات بتونس</span>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdminLoggedIn ? (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-right font-medium shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
                <div className="text-xs"><span className="block text-slate-400 text-[10px]">مرحباً بالمدير</span><span className="font-bold text-red-900">الأستاذ فوزي 🛡️</span></div>
                <button onClick={() => { setIsAdminLoggedIn(false); showToast("🔒 تم تسجيل الخروج."); }} className="bg-red-100 hover:bg-red-200 text-red-800 text-[10px] font-black px-2 py-1 rounded-lg">خروج</button>
              </div>
            ) : (
              <button onClick={() => { setAdminPasswordInput(""); setShowAdminLoginModal(true); }} className="bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs px-3 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5 shrink-0">
                <Lock className="w-3.5 h-3.5" /> دخول الإدارة 🔑
              </button>
            )}
            {activeSubscriberSession ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5 flex items-center gap-2 text-right font-medium shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <div className="text-xs"><span className="block text-slate-400 text-[10px]">مرحباً</span><span className="font-bold text-emerald-900">{activeSubscriberSession.firstName} {activeSubscriberSession.lastName}</span></div>
                <button onClick={() => { setActiveSubscriberSession(null); showToast("🔒 تم تسجيل الخروج."); }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-lg">خروج</button>
              </div>
            ) : (
              <div className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-500 shrink-0 hidden md:block">منصة دوز 🇹🇳</div>
            )}
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex justify-start md:justify-center overflow-x-auto py-2 gap-1.5 scrollbar-none">
              {([
                ["home", "🏠 الرئيسية", "bg-slate-900 text-white"],
                ["library", "📚 المكتبة", "bg-indigo-600 text-white"],
                ["live-rooms", "📹 غرف البث المباشر", "bg-emerald-600 text-white"],
                ["cloud", "☁️ التخزين السحابي", "bg-blue-600 text-white"],
                ["recordings", "🎬 الحلقات المسجّلة", "bg-purple-600 text-white"],
                ["subscriptions", "✏️ التسجيل والاشتراك", "bg-amber-500 text-slate-900"],
                ["admin-panel", `🔑 الإدارة${isAdminLoggedIn ? " 🛡️" : ""}`, "bg-red-50 text-red-700 border border-red-200"],
              ] as const).map(([tab, label, activeClass]) => (
                <button key={tab} onClick={() => { setActiveTab(tab as Tab); if (tab === "admin-panel") setAdminTab("students"); }}
                  className={`text-xs font-black px-3 py-2 rounded-xl transition-all shrink-0 flex items-center gap-1 ${activeTab === tab ? activeClass + " shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>
                  {tab === "live-rooms" && activeTab !== tab && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />}
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 flex-1 w-full text-right pb-16">

        {activeTab === "home" && (
          <div className="space-y-7">
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-950 rounded-3xl p-6 md:p-10 text-white relative overflow-hidden shadow-xl border border-indigo-800">
              <div className="absolute top-0 right-0 w-80 h-80 bg-red-600 rounded-full filter blur-[120px] opacity-10 pointer-events-none" />
              <div className="max-w-3xl space-y-4 relative z-10">
                <span className="bg-red-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full inline-flex items-center gap-1">من السيزيام إلى البكالوريا 🇹🇳</span>
                <h2 className="text-2xl md:text-4xl font-black text-white leading-tight">المنصة التعليمية الأولى لعلوم الحياة والأرض بتونس</h2>
                <p className="text-slate-300 text-sm leading-relaxed font-medium">{platformConfig.welcomeMessage}</p>
                <div className="pt-3 flex flex-wrap gap-3">
                  <button onClick={() => setActiveTab("library")} className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold px-6 py-3 rounded-2xl shadow-lg transition-all">📖 تصفح المكتبة</button>
                  <button onClick={() => setActiveTab("live-rooms")} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-6 py-3 rounded-2xl shadow-lg transition-all flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-white rounded-full animate-ping" /><span>غرف البث المباشر</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: <GraduationCap className="w-6 h-6" />, bg: "bg-indigo-50 text-indigo-600", label: "المراحل الدراسية", val: "ابتدائي · إعدادي · ثانوي" },
                { icon: <Video className="w-6 h-6" />, bg: "bg-emerald-50 text-emerald-600", label: "غرف البث المباشر", val: "78+ غرفة تفاعلية" },
                { icon: <FileText className="w-6 h-6" />, bg: "bg-amber-50 text-amber-600", label: "ملفات المكتبة", val: `${courses.length} ملف` },
                { icon: <Film className="w-6 h-6" />, bg: "bg-purple-50 text-purple-600", label: "الحلقات المحفوظة", val: `${recordings.length} حلقة` },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-200 flex items-center gap-3">
                  <div className={`w-11 h-11 ${s.bg} rounded-xl flex items-center justify-center shrink-0`}>{s.icon}</div>
                  <div><span className="block text-[10px] text-slate-400 font-bold">{s.label}</span><span className="text-xs font-extrabold text-slate-900 block mt-0.5">{s.val}</span></div>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2"><BookOpen className="w-5 h-5 text-indigo-600" /> المسار التعليمي بتونس</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {([["primary", "التعليم الابتدائي", "السنة الأولى → السيزيام", "bg-blue-100 text-blue-800"], ["preparatory", "التعليم الإعدادي", "7 · 8 · 9 أساسي", "bg-teal-100 text-teal-800"], ["secondary", "التعليم الثانوي والباكالوريا", "الأولى ثانوي → الباكالوريا", "bg-purple-100 text-purple-800"]] as const).map(([s, title, sub, badge]) => (
                  <div key={s} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-sm transition-all space-y-3">
                    <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full ${badge}`}>{title}</span>
                    <h4 className="font-black text-slate-900 text-sm">{sub}</h4>
                    <button onClick={() => { setFilterStage(s); setActiveTab("library"); }} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">ملفات {title} ←</button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0"><Info className="w-5 h-5 text-amber-700" /></div>
                <div><h4 className="font-extrabold text-amber-950 text-xs">نظام الاشتراكات بالدينار التونسي</h4><p className="text-slate-600 text-[11px] mt-0.5">سجل اشتراكك واحصل على كلمة مرور للدخول لجميع الغرف والملفات المدفوعة بقيمة {platformConfig.yearlyPriceTnd} دينار سنوياً.</p></div>
              </div>
              <button onClick={() => setActiveTab("subscriptions")} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs py-2.5 px-6 rounded-xl shrink-0 transition-all">سجل الآن 💰</button>
            </div>
          </div>
        )}

        {activeTab === "library" && (
          <div className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200">
              <div><h3 className="font-black text-slate-900 text-base">مستودع الأبحاث والمستندات 📚</h3><p className="text-slate-400 text-xs mt-0.5">ابحث وتصفح وحمل أي فرض أو تمرين.</p></div>
              {isAdminLoggedIn && <button onClick={() => setShowExportModal(true)} className="bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 hover:bg-slate-200 transition-all"><Share2 className="w-3.5 h-3.5" /> تحميل ZIP المنصة</button>}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                <input type="text" placeholder="ابحث عن درس، فرض، أو تمرين..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-3 text-xs text-right outline-none focus:border-indigo-600 transition-all" />
              </div>
              <select value={filterStage} onChange={e => setFilterStage(e.target.value as typeof filterStage)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-right outline-none cursor-pointer focus:border-indigo-600">
                <option value="all">كل المراحل 🇹🇳</option><option value="primary">الابتدائي 📝</option><option value="preparatory">الإعدادي 🔬</option><option value="secondary">الثانوي والباكالوريا 🎓</option>
              </select>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value as typeof filterCategory)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-right outline-none cursor-pointer focus:border-indigo-600">
                <option value="all">كل التصنيفات</option><option value="lesson">دروس وشروحات</option><option value="exercise">سلاسل تمارين</option><option value="exam_prep">فروض مراقبة</option><option value="summary">ملخصات</option>
              </select>
            </div>
            {!isAdminLoggedIn && !activeSubscriberSession && (
              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-center justify-between gap-4 text-xs">
                <p className="text-indigo-900 font-medium">🔔 سجل اشتراكك للوصول للملفات الحصرية المدفوعة</p>
                <button onClick={() => setActiveTab("subscriptions")} className="text-indigo-600 font-black underline shrink-0">التسجيل ←</button>
              </div>
            )}
            {filteredCourses.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredCourses.map(file => {
                  const isLocked = file.isPremium && !isAdminLoggedIn && activeSubscriberSession?.status !== "approved";
                  return (
                    <div key={file.id} className="bg-white rounded-2xl p-5 border border-slate-200 hover:shadow-sm transition-all flex flex-col gap-3 relative">
                      <div className="absolute top-4 left-4">
                        {file.isPremium ? <span className={`flex items-center gap-1 font-extrabold text-[9px] px-2 py-0.5 rounded-full border ${isLocked ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-emerald-100 text-emerald-800 border-emerald-300"}`}>{isLocked ? <><Lock className="w-3 h-3" /> مدفوع</> : <>🔓 مفتوح</>}</span>
                          : <span className="bg-emerald-100 text-emerald-800 font-extrabold text-[9px] px-2.5 py-0.5 rounded-full border border-emerald-300">مجاني 🆓</span>}
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-red-600 uppercase block">• {file.subject}</span>
                        <h4 className="font-extrabold text-slate-900 text-sm leading-snug">{file.title}</h4>
                        <p className="text-slate-500 text-xs line-clamp-2">{file.description}</p>
                      </div>
                      <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span><strong>المستوى:</strong> <span className="text-slate-800">{file.level}</span></span>
                        <span className="flex items-center gap-3"><span>📦 {file.fileSize}</span><span>📥 {file.downloads}</span></span>
                      </div>
                      <div className="pt-1 flex items-center justify-between gap-2 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400 font-mono">{file.uploadedAt}</span>
                        <div className="flex items-center gap-1.5">
                          {isAdminLoggedIn && <button onClick={() => handleDeleteDocument(file.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                          <button onClick={() => handleDownloadFile(file)} className={`text-xs font-black py-1.5 px-4 rounded-xl flex items-center gap-1.5 transition-all ${isLocked ? "bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
                            <Download className="w-3.5 h-3.5" />{isLocked ? "مدفوع 🔒" : "تحميل"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2"><FolderOpen className="w-10 h-10 text-slate-300 mx-auto" /><h4 className="font-bold text-slate-600 text-sm">لم يتم العثور على مستندات!</h4></div>
            )}
          </div>
        )}

        {activeTab === "live-rooms" && (
          <LiveRoomsTab isAdminLoggedIn={isAdminLoggedIn} activeSubscriberSession={activeSubscriberSession} platformConfig={platformConfig} showToast={showToast} recordings={recordings} onSaveRecording={handleSaveRecording} onDeleteRecording={handleDeleteRecording} />
        )}

        {activeTab === "cloud" && (
          <CloudStorageTab isAdminLoggedIn={isAdminLoggedIn} isAllowed={!!(isAdminLoggedIn || activeSubscriberSession?.status === "approved")} showToast={showToast} />
        )}

        {activeTab === "recordings" && (
          <RecordingsTab isAdminLoggedIn={isAdminLoggedIn} activeSubscriberSession={activeSubscriberSession} recordings={recordings} onSaveRecording={handleSaveRecording} onDeleteRecording={handleDeleteRecording} showToast={showToast} />
        )}

        {activeTab === "subscriptions" && (
          <div className="space-y-6 max-w-2xl mx-auto">
            <div className="bg-gradient-to-br from-amber-900 to-slate-950 rounded-3xl p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 left-0 w-48 h-48 bg-amber-500 rounded-full filter blur-[80px] opacity-10 pointer-events-none" />
              <div className="relative z-10 space-y-2">
                <span className="bg-amber-500 text-slate-900 text-[10px] font-extrabold px-3 py-1 rounded-full">✏️ التسجيل والاشتراك</span>
                <h3 className="text-xl font-black">بوابة الاشتراك في المنصة</h3>
                <p className="text-amber-100 text-xs">سجّل بياناتك وانتظر تفعيل حسابك من طرف الأستاذ فوزي بنبراهيم لفتح جميع المحتويات الحصرية.</p>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs space-y-2">
              <h4 className="font-extrabold text-amber-950">💰 طريقة الدفع والاشتراك</h4>
              <p className="text-slate-700">الاشتراك السنوي: <strong>{platformConfig.yearlyPriceTnd} دينار تونسي</strong></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <div className="bg-white rounded-xl p-3 border border-amber-200"><span className="font-bold text-amber-900 block mb-1">💳 D17 / Flouci</span><span className="font-mono text-slate-900 font-extrabold text-sm">{platformConfig.d17Phone}</span></div>
                <div className="bg-white rounded-xl p-3 border border-amber-200"><span className="font-bold text-amber-900 block mb-1">🏦 CCP</span><span className="font-mono text-slate-900 font-extrabold text-xs">{platformConfig.ccpAccount}</span></div>
              </div>
              <p className="text-slate-500 text-[10px]">بعد الدفع، سجّل بياناتك أدناه وسيتم تفعيل حسابك خلال 24 ساعة.</p>
            </div>
            <div className="flex rounded-2xl overflow-hidden border border-slate-200 bg-white">
              <button onClick={() => setShowLoginMode(false)} className={`flex-1 text-xs font-black py-3 transition-all ${!showLoginMode ? "bg-amber-500 text-slate-900" : "text-slate-500 hover:bg-slate-50"}`}>📝 تسجيل جديد</button>
              <button onClick={() => setShowLoginMode(true)} className={`flex-1 text-xs font-black py-3 transition-all ${showLoginMode ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>🔓 تسجيل الدخول</button>
            </div>
            {!showLoginMode ? (
              <form onSubmit={handleRegisterSubscription} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
                <h4 className="font-black text-slate-900 text-sm">طلب اشتراك جديد</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><label className="text-xs font-bold text-slate-700">الاسم *</label><input value={regFirstName} onChange={e => setRegFirstName(e.target.value)} required placeholder="الاسم" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-amber-500" /></div>
                  <div className="space-y-1.5"><label className="text-xs font-bold text-slate-700">اللقب *</label><input value={regLastName} onChange={e => setRegLastName(e.target.value)} required placeholder="اللقب" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-amber-500" /></div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">المستوى الدراسي *</label>
                  <select value={regGrade} onChange={e => setRegGrade(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none cursor-pointer">
                    {["باكالوريا علوم تجريبية","الثالثة ثانوي (علوم تجريبية)","الثانية ثانوي (علوم)","الأولى ثانوي","السنة التاسعة أساسي","السنة الثامنة أساسي","السنة السابعة أساسي","السنة السادسة ابتدائي (سيزيام)","السنة الخامسة ابتدائي","السنة الرابعة ابتدائي","السنة الثالثة ابتدائي","السنة الثانية ابتدائي","السنة الأولى ابتدائي"].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">كلمة المرور *</label>
                  <div className="relative">
                    <input type={showRegPassword ? "text" : "password"} value={regPassword} onChange={e => setRegPassword(e.target.value)} required placeholder="6 أحرف على الأقل" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 pl-10 py-2.5 text-xs text-right outline-none focus:border-amber-500" />
                    <button type="button" onClick={() => setShowRegPassword(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
                  </div>
                </div>
                <div className="space-y-1.5"><label className="text-xs font-bold text-slate-700">تأكيد كلمة المرور *</label><input type="password" value={regConfirmPassword} onChange={e => setRegConfirmPassword(e.target.value)} required placeholder="أعد كتابة كلمة المرور" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-amber-500" /></div>
                <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-sm py-3 rounded-2xl transition-all">🚀 إرسال طلب الاشتراك</button>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="bg-white rounded-3xl border border-slate-200 p-6 space-y-4">
                <h4 className="font-black text-slate-900 text-sm">تسجيل الدخول</h4>
                <div className="grid grid-cols-2 gap-3">
                  <input value={loginFirstName} onChange={e => setLoginFirstName(e.target.value)} required placeholder="الاسم" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-emerald-500" />
                  <input value={loginLastName} onChange={e => setLoginLastName(e.target.value)} required placeholder="اللقب" className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-emerald-500" />
                </div>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required placeholder="كلمة المرور" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-right outline-none focus:border-emerald-500" />
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-3 rounded-2xl transition-all">🔓 دخول</button>
              </form>
            )}
          </div>
        )}

        {activeTab === "admin-panel" && (
          <div className="space-y-5">
            {!isAdminLoggedIn ? (
              <div className="max-w-sm mx-auto bg-white rounded-3xl border border-slate-200 p-8 space-y-5 text-center shadow-sm">
                <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center border border-red-200 mx-auto"><Lock className="w-7 h-7 text-red-600" /></div>
                <h4 className="font-extrabold text-slate-900">بوابة الإدارة الحصرية 🛡️</h4>
                <form onSubmit={e => { e.preventDefault(); if (adminPasswordInput === "ncb200689") { setIsAdminLoggedIn(true); setAdminPasswordInput(""); showToast("🔑 مرحباً يا أستاذ فوزي! تم الولوج."); } else { showToast("❌ كلمة السر غير صحيحة!"); } }} className="space-y-3">
                  <input type="password" required value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} placeholder="كلمة سر الإدارة" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-center outline-none focus:border-red-500 font-mono" />
                  <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-3 rounded-xl">🚀 دخول الإدارة</button>
                </form>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="bg-gradient-to-br from-red-900 to-slate-950 rounded-3xl p-6 text-white relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-48 h-48 bg-red-500 rounded-full filter blur-[80px] opacity-10 pointer-events-none" />
                  <div className="relative z-10 space-y-1"><span className="bg-red-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full">🛡️ لوحة الإدارة</span><h3 className="text-xl font-black mt-2">مرحباً أستاذ فوزي بنبراهيم</h3><p className="text-red-100 text-xs">إدارة المشتركين، الملفات، وإعدادات المنصة من هنا.</p></div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[["students", "👥 المشتركون"], ["add-file", "📁 إضافة ملف"], ["settings", "⚙️ الإعدادات"]].map(([t, l]) => (
                    <button key={t} onClick={() => setAdminTab(t as typeof adminTab)} className={`text-xs font-black px-4 py-2 rounded-xl transition-all ${adminTab === t ? "bg-red-600 text-white shadow-sm" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
                  ))}
                </div>

                {adminTab === "students" && (
                  <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><Users className="w-4 h-4" /><span>{subscriptions.length} مشترك — {subscriptions.filter(s => s.status === "pending").length} بانتظار الموافقة</span></div>
                      <h4 className="font-black text-slate-900 text-sm">قائمة المشتركين</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-xs">
                        <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-600">{["الاسم الكامل","المستوى","تاريخ التسجيل","الحالة","إجراءات"].map(h => <th key={h} className="p-3 font-extrabold text-[11px]">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {subscriptions.map(sub => (
                            <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 font-bold text-slate-900">{sub.firstName} {sub.lastName}</td>
                              <td className="p-3 text-slate-600">{sub.gradeLevel}</td>
                              <td className="p-3 text-slate-500 font-mono text-[10px]">{sub.createdAt}</td>
                              <td className="p-3">{sub.status === "approved" ? <span className="text-emerald-700 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-black">★ مفعّل</span> : sub.status === "rejected" ? <span className="text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full text-[10px] font-bold">مرفوض</span> : <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-extrabold animate-pulse">⏳ انتظار</span>}</td>
                              <td className="p-3"><div className="flex items-center justify-center gap-1">{sub.status === "pending" && <><button onClick={() => handleApproveSubscription(sub.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] py-1 px-2 rounded-lg transition-all">✓ موافقة</button><button onClick={() => handleRejectSubscription(sub.id)} className="bg-rose-600 hover:bg-rose-700 text-white font-black text-[10px] py-1 px-2 rounded-lg transition-all">✕ رفض</button></>}<button onClick={() => handleDeleteSubscription(sub.id)} className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"><Trash2 className="w-4 h-4" /></button></div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {subscriptions.length === 0 && <div className="text-center py-8 text-slate-400 text-xs">لا توجد طلبات بعد</div>}
                    </div>
                  </div>
                )}

                {adminTab === "add-file" && (
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 space-y-5">
                    <h4 className="font-black text-slate-900 text-sm">إضافة درس أو فرض للمكتبة 📚</h4>
                    <form onSubmit={handleAddNewDocument} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">عنوان المستند *</label><input type="text" required placeholder="مثال: فرض مراقبة SVT" value={newFileTitle} onChange={e => setNewFileTitle(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600" /></div>
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">اسم الملف *</label><input type="text" required placeholder="مثال: devoir_svt.pdf" value={newFileName} onChange={e => setNewFileName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600 font-mono" /></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">المرحلة *</label><select value={newFileStage} onChange={e => setNewFileStage(e.target.value as typeof newFileStage)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none cursor-pointer"><option value="primary">الابتدائي</option><option value="preparatory">الإعدادي</option><option value="secondary">الثانوي</option></select></div>
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">المستوى *</label><input type="text" required placeholder="باكالوريا علوم" value={newFileGrade} onChange={e => setNewFileGrade(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600" /></div>
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">التصنيف *</label><select value={newFileCategory} onChange={e => setNewFileCategory(e.target.value as typeof newFileCategory)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none cursor-pointer"><option value="lesson">درس</option><option value="exercise">تمارين</option><option value="exam_prep">فرض</option><option value="summary">ملخص</option></select></div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">المادة *</label><input type="text" required value={newFileSubject} onChange={e => setNewFileSubject(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600" /></div>
                        <div className="flex items-end pb-2"><label className="text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={newFileIsPremium} onChange={e => setNewFileIsPremium(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 cursor-pointer" />🔒 حصري للمشتركين</label></div>
                      </div>
                      <textarea placeholder="وصف مختصر..." value={newFileDesc} rows={2} onChange={e => setNewFileDesc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-right outline-none focus:bg-white focus:border-indigo-600 resize-none" />
                      <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-3 rounded-xl transition-all">🚀 إدراج المستند في المكتبة</button>
                    </form>
                  </div>
                )}

                {adminTab === "settings" && (
                  <form onSubmit={handleUpdateConfig} className="bg-white rounded-3xl p-6 border border-slate-200 space-y-5">
                    <h4 className="font-black text-slate-900 text-sm">إعدادات المنصة والدفع</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[["اسم المنصة","siteName"],["اسم الأستاذ","teacherName"],["هاتف D17 / Flouci","d17Phone"],["حساب CCP","ccpAccount"],["هاتف التواصل","contactPhone"]].map(([label, key]) => (
                        <div key={key} className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">{label}</label><input type="text" required value={(platformConfig as unknown as Record<string,string>)[key]!} onChange={e => setPlatformConfig({ ...platformConfig, [key]: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600" /></div>
                      ))}
                      <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">الاشتراك السنوي (دينار)</label><input type="number" required value={platformConfig.yearlyPriceTnd} onChange={e => setPlatformConfig({ ...platformConfig, yearlyPriceTnd: +e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-right outline-none focus:bg-white focus:border-indigo-600 font-mono" /></div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">رابط MEGA</label><input type="url" value={platformConfig.megaLink || ""} onChange={e => setPlatformConfig({ ...platformConfig, megaLink: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs outline-none focus:bg-white focus:border-indigo-600 font-mono text-left" dir="ltr" placeholder="https://mega.nz/folder/..." /></div>
                      <div className="space-y-1.5"><label className="block text-xs font-bold text-slate-700">رابط Google Drive</label><input type="url" value={platformConfig.googleDriveLink || ""} onChange={e => setPlatformConfig({ ...platformConfig, googleDriveLink: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs outline-none focus:bg-white focus:border-indigo-600 font-mono text-left" dir="ltr" /></div>
                    </div>
                    <textarea required value={platformConfig.welcomeMessage} rows={2} onChange={e => setPlatformConfig({ ...platformConfig, welcomeMessage: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-right outline-none focus:bg-white focus:border-indigo-600 resize-none" />
                    <button type="submit" className="w-full bg-amber-500 hover:bg-amber-600 text-slate-900 font-extrabold text-xs py-3 rounded-xl transition-all">💾 حفظ التعديلات</button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-slate-900 text-white py-10 border-t border-slate-800 text-right mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            <div className="space-y-3"><span className="font-black text-base text-white block">{platformConfig.siteName}</span><p className="text-xs text-slate-400 leading-relaxed">بوابة علمية تفاعلية أطلقها الأستاذ <strong>فوزي بنبراهيم</strong> لدعم تلاميذ تونس بملفات SVT والدروس المباشرة.</p></div>
            <div className="space-y-3"><span className="font-extrabold text-xs text-amber-300 block">📞 الاستفسار والدعم</span><span className="font-mono text-xs text-white font-extrabold block">الهاتف: {platformConfig.contactPhone}</span><span className="font-mono text-xs text-slate-400 block">CCP: {platformConfig.ccpAccount}</span></div>
            <div className="space-y-3"><span className="font-extrabold text-xs text-amber-300 block">⭐ أكاديمية دوز</span><p className="text-xs text-slate-400">محتوى علمي هادف لتأهيل تلاميذ الجمهورية التونسية.</p></div>
          </div>
          <div className="border-t border-slate-800 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <p>© {new Date().getFullYear()} {platformConfig.siteName}. جميع الحقوق محفوظة 🇹🇳</p>
            <div className="flex items-center gap-1"><span>تطوير: </span><strong className="text-slate-300">أكاديمية دوز للعلوم الطبيعية</strong></div>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {showExportModal && isAdminLoggedIn && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 15 }} className="bg-white rounded-3xl p-6 max-w-xl w-full border border-slate-200 text-right shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3"><button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100">✕</button><div className="flex items-center gap-2"><FileCode className="w-5 h-5 text-amber-500" /><span className="font-black text-slate-900 text-sm">تحميل ملف ZIP المنصة 📦</span></div></div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-2"><span className="font-bold text-emerald-900 text-xs block">✅ الحجم المتوقع للـ ZIP أقل من 100 MB</span><ul className="text-[11px] text-slate-700 space-y-1.5"><li>• node_modules و attached_assets مستثناة تلقائياً</li><li>• الكود مضغوط ومحسّن</li></ul></div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2"><h5 className="font-bold text-slate-900 text-xs">💡 طريقة تحميل ZIP:</h5><ol className="list-decimal list-inside text-[11px] text-slate-700 space-y-1.5"><li>اذهب للقائمة العليا في Replit (الترس ⚙️)</li><li>اختر "Export ZIP"</li><li>سيتم تحميل الكود الكامل فوراً</li></ol></div>
              {platformConfig.megaLink && !platformConfig.megaLink.includes("douz_svt_academy_backup_shared") && <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center"><a href={platformConfig.megaLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-3 px-6 rounded-xl transition-all"><ExternalLink className="w-4 h-4" /> تحميل من سحابة MEGA 📥</a></div>}
              <div className="flex justify-end"><button onClick={() => setShowExportModal(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs py-2.5 px-6 rounded-xl transition-all">فهمت، إغلاق 👍</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAdminLoginModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl space-y-5 text-right relative">
              <button onClick={() => setShowAdminLoginModal(false)} className="absolute top-4 left-4 text-slate-400 hover:text-slate-600 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-xs">✕</button>
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center border border-red-200 mx-auto"><Lock className="w-6 h-6 text-red-600" /></div>
              <div className="text-center"><h4 className="font-extrabold text-slate-900 text-sm">بوابة التحقق للإدارة 🛡️</h4></div>
              <form onSubmit={e => { e.preventDefault(); if (adminPasswordInput === "ncb200689") { setIsAdminLoggedIn(true); setShowAdminLoginModal(false); showToast("🔑 مرحباً يا أستاذ فوزي! تم الولوج."); setAdminPasswordInput(""); } else { showToast("❌ كلمة السر غير صحيحة!"); } }} className="space-y-4">
                <input type="password" required placeholder="كلمة سر الإدارة" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-center outline-none focus:bg-white focus:border-red-500 font-mono" />
                <div className="flex gap-2"><button type="button" onClick={() => setShowAdminLoginModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 rounded-xl">إلغاء</button><button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs py-2.5 rounded-xl">🚀 دخول</button></div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lockedFileToDownload && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }} className="bg-white rounded-3xl border border-slate-200 p-6 max-w-sm w-full shadow-2xl space-y-5 text-right relative">
              <button onClick={() => setLockedFileToDownload(null)} className="absolute top-4 left-4 text-slate-400 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-xs">✕</button>
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-200"><Lock className="w-6 h-6 text-amber-500 animate-pulse" /></div>
              <div><h4 className="font-extrabold text-slate-900 text-sm">هذا المستند للمشتركين 🔒</h4><p className="text-slate-500 text-xs mt-1">الملف <code className="bg-slate-100 px-1 rounded">{lockedFileToDownload.fileName}</code> مخصص للمشتركين النشطين.</p></div>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs"><span className="font-bold text-amber-900 block mb-1">قيمة الاشتراك: {platformConfig.yearlyPriceTnd} دينار سنوياً</span><div className="bg-white p-2 rounded-lg border border-amber-200 text-center font-mono text-amber-900 font-black">{platformConfig.d17Phone}</div></div>
              <div className="flex gap-2"><button onClick={() => setLockedFileToDownload(null)} className="flex-1 bg-slate-100 text-slate-700 font-bold text-xs py-2.5 rounded-xl">إغلاق</button><button onClick={() => { setLockedFileToDownload(null); setActiveTab("subscriptions"); }} className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black text-xs py-2.5 rounded-xl">سجّل اشتراكك ←</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
