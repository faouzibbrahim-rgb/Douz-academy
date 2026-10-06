import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Pencil, Eraser, Square, Circle, Minus, Type, Trash2,
  Undo2, Redo2, Download, ZoomIn, ZoomOut,
  ArrowRight, Highlighter, Maximize2, Minimize2
} from "lucide-react";

interface Point { x: number; y: number }
interface Stroke {
  id: string; tool: Tool; points: Point[];
  color: string; width: number; fill: boolean; text?: string; opacity: number;
}
type Tool = "pen" | "highlighter" | "eraser" | "line" | "rect" | "circle" | "arrow" | "text" | "select";

interface Props {
  isAdmin: boolean;
  socket?: { on: (e: string, cb: (d: unknown) => void) => void; off: (e: string) => void; emit: (e: string, d?: unknown) => void } | null;
  roomCode?: string;
  onSaveSnapshot?: (dataUrl: string) => void;
}

const COLORS = ["#1e293b","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#ffffff","#94a3b8"];
const WIDTHS = [2, 4, 8, 14];
// Logical canvas dimensions (coordinate space — independent of display size)
const LW = 1600;
const LH = 900;

export default function InteractiveWhiteboard({ isAdmin, socket, roomCode, onSaveSnapshot }: Props) {
  const wrapRef    = useRef<HTMLDivElement>(null);   // outer scroll wrapper (overflow:hidden)
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  const [tool, setTool]               = useState<Tool>(isAdmin ? "pen" : "select");
  const [color, setColor]             = useState("#1e293b");
  const [width, setWidth]             = useState(4);
  const [fill, setFill]               = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [zoom, setZoom]               = useState(1);
  const [pan, setPan]                 = useState({ x: 0, y: 0 });
  const [isFullWB, setIsFullWB]       = useState(false);

  const strokes        = useRef<Stroke[]>([]);
  const undoStack      = useRef<Stroke[][]>([]);
  const redoStack      = useRef<Stroke[][]>([]);
  const isDrawing      = useRef(false);
  const currentStroke  = useRef<Stroke | null>(null);
  const startPoint     = useRef<Point>({ x: 0, y: 0 });
  // For panning with middle-button / two-finger
  const isPanning      = useRef(false);
  const panStart       = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // ── Redraw main canvas ──────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply zoom + pan transform
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Grid
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 0.5 / zoom;
    for (let x = 0; x <= LW; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, LH); ctx.stroke(); }
    for (let y = 0; y <= LH; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(LW, y); ctx.stroke(); }

    strokes.current.forEach(s => drawStroke(ctx, s));
    ctx.restore();
  }, [zoom, pan]);

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (!s.points.length) return;
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.strokeStyle = s.tool === "eraser" ? "#ffffff" : s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = s.width;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    if (s.tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (s.tool === "pen" || s.tool === "highlighter") {
      if (s.tool === "highlighter") ctx.globalAlpha = s.opacity * 0.35;
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (s.tool === "line" && s.points.length >= 2) {
      const [a, b] = [s.points[0]!, s.points[s.points.length - 1]!];
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (s.tool === "arrow" && s.points.length >= 2) {
      const [a, b] = [s.points[0]!, s.points[s.points.length - 1]!];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const head  = 14 + s.width;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(angle - Math.PI / 6), b.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(b.x - head * Math.cos(angle + Math.PI / 6), b.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fill();
    } else if (s.tool === "rect" && s.points.length >= 2) {
      const [a, b] = [s.points[0]!, s.points[s.points.length - 1]!];
      const rx = Math.min(a.x, b.x), ry = Math.min(a.y, b.y);
      const rw = Math.abs(b.x - a.x),  rh = Math.abs(b.y - a.y);
      if (s.fill) ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    } else if (s.tool === "circle" && s.points.length >= 2) {
      const [a, b] = [s.points[0]!, s.points[s.points.length - 1]!];
      const rx  = (a.x + b.x) / 2, ry = (a.y + b.y) / 2;
      const rad = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2) / 2;
      ctx.beginPath(); ctx.ellipse(rx, ry, rad, rad, 0, 0, Math.PI * 2);
      if (s.fill) ctx.fill(); ctx.stroke();
    } else if (s.tool === "text" && s.text) {
      ctx.font = `${Math.max(14, s.width * 4)}px Cairo, Arial`;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.points[0]!.x, s.points[0]!.y);
    }
    ctx.restore();
  }

  useEffect(() => { redraw(); }, [redraw]);

  // ── Resize: canvas fills its container exactly ──────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const { width: w, height: h } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      [canvasRef.current, overlayRef.current].forEach(c => {
        if (!c) return;
        c.width  = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width  = `${w}px`;
        c.style.height = `${h}px`;
        const ctx = c.getContext("2d");
        if (ctx) ctx.scale(dpr, dpr);
      });
      redraw();
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [redraw]);

  // ── Block ALL touch/pointer events on canvas (non-passive) ──
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // touch-action: none via CSS handles the browser-level scroll block,
    // but we also add passive:false listeners for full control.
    const stop = (e: TouchEvent) => { e.preventDefault(); };
    overlay.addEventListener("touchstart",  stop, { passive: false });
    overlay.addEventListener("touchmove",   stop, { passive: false });
    overlay.addEventListener("touchend",    stop, { passive: false });
    overlay.addEventListener("touchcancel", stop, { passive: false });

    // Also block contextmenu on right-click
    const noCtx = (e: Event) => e.preventDefault();
    overlay.addEventListener("contextmenu", noCtx);

    return () => {
      overlay.removeEventListener("touchstart",  stop);
      overlay.removeEventListener("touchmove",   stop);
      overlay.removeEventListener("touchend",    stop);
      overlay.removeEventListener("touchcancel", stop);
      overlay.removeEventListener("contextmenu", noCtx);
    };
  }, []);

  // ── Convert screen point → logical canvas point ────────────
  function screenToLogical(cx: number, cy: number): Point {
    return { x: (cx - pan.x) / zoom, y: (cy - pan.y) / zoom };
  }

  function getClientXY(e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): { cx: number; cy: number } | null {
    const overlay = overlayRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if ("touches" in e) {
      if (!(e as TouchEvent).touches.length) return null;
      const t = (e as TouchEvent).touches[0]!;
      return { cx: t.clientX - rect.left, cy: t.clientY - rect.top };
    }
    return {
      cx: (e as MouseEvent).clientX - rect.left,
      cy: (e as MouseEvent).clientY - rect.top,
    };
  }

  // ── Draw preview on overlay ─────────────────────────────────
  function drawOverlayPreview(s: Stroke) {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    drawStroke(ctx, s);
    ctx.restore();
  }

  function clearOverlay() {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  }

  // ── Pointer down ────────────────────────────────────────────
  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    // Middle button → pan
    if ("button" in e && e.button === 1) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }

    if (!isAdmin || tool === "select") return;

    const xy = getClientXY(e);
    if (!xy) return;
    const pt = screenToLogical(xy.cx, xy.cy);
    startPoint.current = pt;
    isDrawing.current  = true;

    if (tool === "text") {
      const text = window.prompt("أدخل النص:");
      if (!text) { isDrawing.current = false; return; }
      const s: Stroke = { id: `s-${Date.now()}`, tool, points: [pt], color, width, fill, text, opacity: 1 };
      commitStroke(s);
      return;
    }
    currentStroke.current = { id: `s-${Date.now()}`, tool, points: [pt], color, width, fill, opacity: 1 };
  }

  // ── Pointer move ────────────────────────────────────────────
  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (isPanning.current && "clientX" in e) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
      return;
    }
    if (!isDrawing.current || !currentStroke.current) return;
    const xy = getClientXY(e);
    if (!xy) return;
    const pt = screenToLogical(xy.cx, xy.cy);
    currentStroke.current.points.push(pt);
    drawOverlayPreview(currentStroke.current);
  }

  // ── Pointer up ──────────────────────────────────────────────
  function onPointerUp() {
    isPanning.current = false;
    if (!isDrawing.current || !currentStroke.current) return;
    isDrawing.current = false;
    const s = currentStroke.current;
    currentStroke.current = null;
    clearOverlay();
    commitStroke(s);
  }

  function commitStroke(s: Stroke) {
    undoStack.current.push([...strokes.current]);
    redoStack.current = [];
    strokes.current.push(s);
    redraw();
    socket?.emit("wb:stroke", { roomCode, stroke: s });
  }

  // ── Wheel: zoom ─────────────────────────────────────────────
  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect   = overlay.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta  = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => {
      const next = Math.min(4, Math.max(0.25, z * delta));
      // Zoom toward mouse cursor
      setPan(p => ({
        x: mouseX - (mouseX - p.x) * (next / z),
        y: mouseY - (mouseY - p.y) * (next / z),
      }));
      return next;
    });
  }

  // ── Socket events ───────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onStroke = (stroke: unknown) => { strokes.current.push(stroke as Stroke); redraw(); };
    const onClear  = () => { strokes.current = []; undoStack.current = []; redoStack.current = []; redraw(); };
    const onUndo   = () => {
      if (undoStack.current.length) {
        redoStack.current.push([...strokes.current]);
        strokes.current = undoStack.current.pop()!;
        redraw();
      }
    };
    socket.on("wb:stroke", onStroke);
    socket.on("wb:clear",  onClear);
    socket.on("wb:undo",   onUndo);
    return () => { socket.off("wb:stroke"); socket.off("wb:clear"); socket.off("wb:undo"); };
  }, [socket, redraw]);

  // ── Undo / Redo ─────────────────────────────────────────────
  function undo() {
    if (!undoStack.current.length) return;
    redoStack.current.push([...strokes.current]);
    strokes.current = undoStack.current.pop()!;
    redraw();
    socket?.emit("wb:undo", { roomCode });
  }
  function redo() {
    if (!redoStack.current.length) return;
    undoStack.current.push([...strokes.current]);
    strokes.current = redoStack.current.pop()!;
    redraw();
  }
  function clearBoard() {
    if (!window.confirm("مسح السبورة كاملاً؟")) return;
    undoStack.current.push([...strokes.current]);
    strokes.current = [];
    redraw();
    socket?.emit("wb:clear", { roomCode });
  }
  function exportPNG() {
    const canvas = canvasRef.current!;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `سبورة-${new Date().toLocaleDateString("ar-TN")}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    onSaveSnapshot?.(canvas.toDataURL("image/png"));
  }
  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); }

  const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: "pen",         icon: <Pencil      className="w-4 h-4" />, label: "قلم"      },
    { id: "highlighter", icon: <Highlighter className="w-4 h-4" />, label: "تمييز"    },
    { id: "eraser",      icon: <Eraser      className="w-4 h-4" />, label: "ممحاة"    },
    { id: "line",        icon: <Minus       className="w-4 h-4" />, label: "خط"       },
    { id: "arrow",       icon: <ArrowRight  className="w-4 h-4" />, label: "سهم"      },
    { id: "rect",        icon: <Square      className="w-4 h-4" />, label: "مستطيل"   },
    { id: "circle",      icon: <Circle      className="w-4 h-4" />, label: "دائرة"    },
    { id: "text",        icon: <Type        className="w-4 h-4" />, label: "نص"       },
  ];

  const cursorStyle: React.CSSProperties = {
    cursor: isAdmin && tool !== "select"
      ? tool === "eraser" ? "cell" : "crosshair"
      : "default",
    // KEY: prevents browser scroll/zoom when touching the canvas
    touchAction: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  return (
    <div
      className={`flex flex-col bg-slate-900 select-none ${
        isFullWB ? "fixed inset-0 z-[9999]" : "absolute inset-0"
      }`}
    >
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="bg-slate-800 border-b border-slate-700 px-2 py-1.5 flex items-center gap-1.5 flex-wrap shrink-0 z-10">

        {isAdmin && (
          <div className="flex items-center gap-0.5 bg-slate-700 rounded-xl p-1">
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => setTool(t.id)} title={t.label}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-xs ${
                  tool === t.id ? "bg-indigo-600 text-white shadow" : "text-slate-300 hover:bg-slate-600"
                }`}>
                {t.icon}
              </button>
            ))}
          </div>
        )}

        {isAdmin && (
          <>
            {/* Color */}
            <div className="relative">
              <button
                onClick={() => setShowColorPicker(v => !v)}
                className="w-8 h-8 rounded-xl border-2 border-slate-600 shadow-sm transition-all hover:scale-110"
                style={{ background: color }}
              />
              {showColorPicker && (
                <div className="absolute top-full mt-1 right-0 bg-slate-800 border border-slate-600 rounded-2xl p-2 shadow-2xl z-20 flex flex-wrap gap-1.5 w-36">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => { setColor(c); setShowColorPicker(false); }}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${color === c ? "border-indigo-400 scale-110" : "border-slate-600"}`}
                      style={{ background: c }} />
                  ))}
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    className="w-7 h-7 rounded-full cursor-pointer border-0 p-0" title="لون مخصص" />
                </div>
              )}
            </div>

            {/* Width */}
            <div className="flex items-center gap-0.5 bg-slate-700 rounded-xl p-1">
              {WIDTHS.map(w => (
                <button key={w} onClick={() => setWidth(w)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    width === w ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-600"
                  }`}>
                  <div className="rounded-full bg-current" style={{ width: Math.min(w * 1.5, 16), height: Math.min(w * 1.5, 16) }} />
                </button>
              ))}
            </div>

            {(tool === "rect" || tool === "circle") && (
              <button onClick={() => setFill(v => !v)}
                className={`text-xs font-bold px-3 h-8 rounded-xl border transition-all ${
                  fill ? "bg-indigo-600 text-white border-indigo-700" : "bg-slate-700 text-slate-300 border-slate-600"
                }`}>
                تعبئة
              </button>
            )}

            <div className="w-px h-6 bg-slate-600" />

            <button onClick={undo}       title="تراجع"   className="w-8 h-8 rounded-xl hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-all"><Undo2  className="w-4 h-4" /></button>
            <button onClick={redo}       title="إعادة"    className="w-8 h-8 rounded-xl hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-all"><Redo2  className="w-4 h-4" /></button>
            <button onClick={clearBoard} title="مسح الكل" className="w-8 h-8 rounded-xl hover:bg-red-900  flex items-center justify-center text-red-400  transition-all"><Trash2 className="w-4 h-4" /></button>
          </>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-0.5 bg-slate-700 rounded-xl p-1 mr-auto">
          <button onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))}
            className="w-7 h-7 rounded-lg hover:bg-slate-600 flex items-center justify-center text-slate-300"><ZoomOut className="w-3.5 h-3.5" /></button>
          <button onClick={resetView}
            className="text-[10px] font-mono text-slate-400 w-10 text-center hover:text-white transition-colors">{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.min(4, +(z + 0.1).toFixed(2)))}
            className="w-7 h-7 rounded-lg hover:bg-slate-600 flex items-center justify-center text-slate-300"><ZoomIn className="w-3.5 h-3.5" /></button>
        </div>

        {/* Export PNG */}
        {isAdmin && (
          <button onClick={exportPNG}
            className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold px-3 h-8 rounded-xl transition-all">
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
        )}

        {/* Fullscreen toggle */}
        <button onClick={() => setIsFullWB(v => !v)} title={isFullWB ? "تصغير" : "ملء الشاشة"}
          className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300 transition-all">
          {isFullWB ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Canvas area — fills all remaining space ──────────── */}
      <div
        ref={wrapRef}
        className="flex-1 relative overflow-hidden bg-slate-900"
        style={{ touchAction: "none" }}   /* block browser scroll/pinch on the whole area */
      >
        {/* Main canvas (committed strokes) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{ display: "block", background: "#fff" }}
        />
        {/* Overlay canvas (live drawing preview) — captures all input */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0"
          style={{ ...cursorStyle, display: "block" }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onMouseLeave={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
          onTouchCancel={onPointerUp}
          onWheel={onWheel}
        />

        {/* Viewer label */}
        {!isAdmin && (
          <div className="absolute bottom-3 right-3 bg-slate-800/80 text-slate-300 text-[10px] font-bold px-3 py-1.5 rounded-full pointer-events-none">
            وضع المشاهدة — الكتابة للمدير فقط
          </div>
        )}

        {/* Zoom hint */}
        <div className="absolute bottom-3 left-3 bg-slate-800/60 text-slate-500 text-[9px] px-2 py-1 rounded-full pointer-events-none">
          {isAdmin ? "عجلة الفأرة للتكبير · الزر الأوسط للتحريك" : "عجلة الفأرة للتكبير"}
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────── */}
      <div className="bg-slate-800 border-t border-slate-700 px-3 py-1 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
        <span>{isAdmin ? `أداة: ${TOOLS.find(t2 => t2.id === tool)?.label ?? tool}` : "مشاهدة"}</span>
        <span>{strokes.current.length} ضربة</span>
      </div>
    </div>
  );
}
