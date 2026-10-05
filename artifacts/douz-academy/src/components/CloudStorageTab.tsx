import React, { useState } from "react";
import { Cloud, ExternalLink, FolderOpen, Download, Lock, HardDrive, Globe, Smartphone, RefreshCw } from "lucide-react";

interface Props {
  isAdminLoggedIn: boolean;
  isAllowed: boolean;
  showToast: (msg: string) => void;
}

export default function CloudStorageTab({ isAdminLoggedIn, isAllowed, showToast }: Props) {
  const [activeCloud, setActiveCloud] = useState<"mega" | "drive" | "local">("mega");

  const clouds = [
    { id: "mega" as const, icon: <Cloud className="w-5 h-5" />, label: "MEGA Cloud", color: "bg-red-50 text-red-700 border-red-200", active: "bg-red-600 text-white", desc: "تخزين مشفر سريع — 50 GB مجانية" },
    { id: "drive" as const, icon: <Globe className="w-5 h-5" />, label: "Google Drive", color: "bg-blue-50 text-blue-700 border-blue-200", active: "bg-blue-600 text-white", desc: "تزامن مع حساب Google" },
    { id: "local" as const, icon: <HardDrive className="w-5 h-5" />, label: "تخزين محلي", color: "bg-slate-50 text-slate-700 border-slate-200", active: "bg-slate-700 text-white", desc: "ملفاتك المحفوظة محلياً" },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <div className="bg-gradient-to-br from-blue-900 to-slate-950 rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-48 h-48 bg-blue-500 rounded-full filter blur-[80px] opacity-10 pointer-events-none" />
        <div className="relative z-10 space-y-2">
          <span className="bg-blue-600 text-white text-[10px] font-extrabold px-3 py-1 rounded-full">☁️ التخزين السحابي</span>
          <h3 className="text-xl font-black">مستودع الملفات السحابي</h3>
          <p className="text-blue-100 text-xs">جميع ملفات المنصة محفوظة بأمان على السحابة. الوصول للمشتركين المفعّلين فقط.</p>
        </div>
      </div>

      {!isAllowed && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-xs">
          <Lock className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-amber-900 font-medium">هذه الخدمة للمشتركين النشطين فقط. سجّل اشتراكك للوصول لكل الملفات السحابية.</p>
        </div>
      )}

      <div className="flex gap-2">
        {clouds.map(c => (
          <button key={c.id} onClick={() => setActiveCloud(c.id)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-black transition-all ${activeCloud === c.id ? c.active + " border-transparent shadow-sm" : c.color}`}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {activeCloud === "mega" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center border border-red-200"><Cloud className="w-5 h-5 text-red-600" /></div>
              <div className="text-right"><h4 className="font-black text-slate-900 text-sm">MEGA Cloud Storage</h4><p className="text-slate-500 text-xs">تخزين مشفّر وآمن — أسرع تنزيل</p></div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[["50 GB", "مساحة مجانية"], ["0 DT", "بدون رسوم إضافية"], ["E2E", "تشفير كامل"]].map(([v, l]) => (
                <div key={l} className="bg-red-50 rounded-xl p-3 border border-red-100"><span className="block font-black text-red-900 text-sm">{v}</span><span className="text-[10px] text-slate-500">{l}</span></div>
              ))}
            </div>
            {isAllowed ? (
              <a href="https://mega.nz" target="_blank" rel="noreferrer" className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                <ExternalLink className="w-4 h-4" /> فتح MEGA Cloud
              </a>
            ) : (
              <button onClick={() => showToast("🔒 يجب تفعيل اشتراكك أولاً!")} className="w-full bg-slate-100 text-slate-500 font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200">
                <Lock className="w-4 h-4" /> محجوز للمشتركين
              </button>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2">
            <h5 className="font-black text-slate-900">📋 كيفية الوصول لملفات SVT على MEGA:</h5>
            <ol className="list-decimal list-inside text-slate-600 space-y-1.5">
              <li>اضغط زر "فتح MEGA Cloud" أعلاه</li>
              <li>أنشئ حساباً مجانياً إذا لم يكن لديك</li>
              <li>ابحث عن مجلد "Douz Academy SVT"</li>
              <li>حمّل أو شاهد الملفات مباشرة</li>
            </ol>
          </div>
        </div>
      )}

      {activeCloud === "drive" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200"><Globe className="w-5 h-5 text-blue-600" /></div>
              <div className="text-right"><h4 className="font-black text-slate-900 text-sm">Google Drive</h4><p className="text-slate-500 text-xs">مشاركة سهلة عبر رابط مباشر</p></div>
            </div>
            {isAllowed ? (
              <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all">
                <ExternalLink className="w-4 h-4" /> فتح Google Drive
              </a>
            ) : (
              <button onClick={() => showToast("🔒 يجب تفعيل اشتراكك أولاً!")} className="w-full bg-slate-100 text-slate-500 font-black text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed border border-slate-200">
                <Lock className="w-4 h-4" /> محجوز للمشتركين
              </button>
            )}
          </div>
        </div>
      )}

      {activeCloud === "local" && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center border border-slate-200"><HardDrive className="w-5 h-5 text-slate-600" /></div>
              <div className="text-right"><h4 className="font-black text-slate-900 text-sm">التخزين المحلي للمنصة</h4><p className="text-slate-500 text-xs">ملفات محفوظة في متصفحك</p></div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-center space-y-2">
              <FolderOpen className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-slate-500 text-xs">الملفات المحمّلة تُحفظ على جهازك مباشرة.</p>
              <p className="text-slate-400 text-[10px]">استخدم متصفح Chrome أو Firefox للنتائج الأفضل.</p>
            </div>
          </div>
        </div>
      )}

      {isAdminLoggedIn && (
        <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-3">
          <h4 className="font-black text-sm flex items-center gap-2"><RefreshCw className="w-4 h-4 text-blue-400" /> إعدادات المزامنة (للمدير فقط)</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[["مزامنة تلقائية", "كل 5 دقائق"], ["نسخ احتياطي", "يومياً"], ["حجم البيانات", "< 5 MB"], ["آخر مزامنة", "منذ قليل"]].map(([k, v]) => (
              <div key={k} className="bg-slate-800 rounded-xl p-3 border border-slate-700"><span className="block text-slate-400 text-[10px]">{k}</span><span className="font-black text-white">{v}</span></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
