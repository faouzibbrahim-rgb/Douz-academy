import React, { useState } from "react";
import { Film, Download, Trash2, Lock, Search, Play, Calendar, Clock, HardDrive } from "lucide-react";
import { SessionRecording, StudentSubscription } from "../types";

interface Props {
  isAdminLoggedIn: boolean;
  activeSubscriberSession: StudentSubscription | null;
  recordings: SessionRecording[];
  onSaveRecording: (rec: SessionRecording) => void;
  onDeleteRecording: (id: string) => void;
  showToast: (msg: string) => void;
}

const STAGE_LABELS: Record<string, string> = { primary: "ابتدائي", preparatory: "إعدادي", secondary: "ثانوي" };

export default function RecordingsTab({ isAdminLoggedIn, activeSubscriberSession, recordings, onDeleteRecording, showToast }: Props) {
  const [searchQ, setSearchQ] = useState("");
  const [stageFilter, setStageFilter] = useState<"all" | "primary" | "preparatory" | "secondary">("all");
  const isAllowed = isAdminLoggedIn || activeSubscriberSession?.status === "approved";

  const filtered = recordings.filter(r => {
    const q = searchQ.toLowerCase();
    return (!q || r.title.toLowerCase().includes(q) || r.level.toLowerCase().includes(q)) && (stageFilter === "all" || r.stage === stageFilter);
  });

  const handleDownload = (rec: SessionRecording) => {
    if (!isAllowed) { showToast("🔒 يجب تفعيل اشتراكك للوصول للتسجيلات!"); return; }
    if (rec.url) {
      const a = document.createElement("a"); a.href = rec.url; a.download = `${rec.title}.webm`; document.body.appendChild(a); a.click(); document.body.removeChild(a);
      showToast("📥 جاري تحميل الحلقة...");
    } else { showToast("⚠️ رابط التحميل غير متاح لهذه الحلقة."); }
  };

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-purple-900 to-slate-950 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 bg-purple-500 rounded-full filter blur-[80px] opacity-10 pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <span className="bg-purple-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full">🎬 الحلقات المسجّلة</span>
          <h3 className="text-xl font-black">أرشيف جلسات البث المباشر</h3>
          <p className="text-purple-100 text-xs">جميع حلقات الأستاذ فوزي بنبراهيم محفوظة هنا لإعادة المشاهدة. {recordings.length} حلقة متاحة.</p>
        </div>
      </div>

      {!isAllowed && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs">
          <Lock className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-amber-900 font-medium">مشاهدة التسجيلات للمشتركين النشطين فقط.</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
          <input type="text" placeholder="ابحث عن حلقة..." value={searchQ} onChange={e => setSearchQ(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pr-10 pl-4 py-3 text-xs text-right outline-none focus:border-purple-600" />
        </div>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value as typeof stageFilter)} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-right outline-none cursor-pointer">
          <option value="all">كل المراحل</option><option value="primary">الابتدائي</option><option value="preparatory">الإعدادي</option><option value="secondary">الثانوي</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(rec => (
            <div key={rec.id} className="bg-white rounded-2xl p-5 border border-slate-200 hover:shadow-sm transition-all space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 border border-purple-200"><Film className="w-5 h-5 text-purple-700" /></div>
                <div className="text-right flex-1"><h4 className="font-black text-slate-900 text-sm leading-snug">{rec.title}</h4><span className="text-[10px] text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">{STAGE_LABELS[rec.stage]}</span></div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="space-y-0.5"><Calendar className="w-3.5 h-3.5 text-slate-400 mx-auto" /><span className="text-slate-600 block">{rec.recordedAt.substring(0, 10)}</span></div>
                <div className="space-y-0.5"><Clock className="w-3.5 h-3.5 text-slate-400 mx-auto" /><span className="text-slate-600 block">{rec.duration}</span></div>
                <div className="space-y-0.5"><HardDrive className="w-3.5 h-3.5 text-slate-400 mx-auto" /><span className="text-slate-600 block">{rec.fileSize}</span></div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                {isAdminLoggedIn && <button onClick={() => onDeleteRecording(rec.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>}
                <button onClick={() => handleDownload(rec)} className={`flex-1 text-xs font-black py-2 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-all ${isAllowed ? "bg-purple-600 hover:bg-purple-700 text-white" : "bg-slate-100 text-slate-500 cursor-not-allowed border border-slate-200"}`}>
                  {isAllowed ? <><Download className="w-3.5 h-3.5" /> تحميل</> : <><Lock className="w-3.5 h-3.5" /> محجوز</>}
                </button>
                {isAllowed && rec.url && <button onClick={() => { const w = window.open(); if (w) { w.document.write(`<video src="${rec.url}" controls autoplay style="width:100%;height:100vh;background:#000"></video>`); } }} className="w-9 h-9 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center transition-all"><Play className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
          <Film className="w-12 h-12 text-slate-200 mx-auto" />
          <h4 className="font-bold text-slate-600 text-sm">{recordings.length === 0 ? "لا توجد حلقات مسجّلة بعد" : "لا توجد حلقات مطابقة للبحث"}</h4>
          <p className="text-slate-400 text-xs">{recordings.length === 0 ? "ستظهر هنا الحلقات بعد انتهاء جلسات البث المباشر." : "جرّب تغيير فلتر البحث."}</p>
        </div>
      )}

      {recordings.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-4 justify-around text-center text-xs">
          <div><span className="font-black text-slate-900 text-base block">{recordings.length}</span><span className="text-slate-500">حلقة مسجّلة</span></div>
          <div><span className="font-black text-slate-900 text-base block">{[...new Set(recordings.map(r => r.level))].length}</span><span className="text-slate-500">مستوى مغطّى</span></div>
          <div><span className="font-black text-slate-900 text-base block">{recordings.reduce((acc, r) => acc + +r.fileSize.replace(/[^\d.]/g, ""), 0).toFixed(1)} MB</span><span className="text-slate-500">حجم الأرشيف</span></div>
        </div>
      )}
    </div>
  );
}
