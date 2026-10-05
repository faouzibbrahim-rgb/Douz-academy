import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowRight, X, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff,
  Users, MessageCircle, Send, Hand, Pencil, Copy, CheckCircle,
  Shield, UserX, VideoIcon, MicIcon, Eye, LogOut,
  Maximize, Minimize, Volume2, VolumeX, Settings,
  Radio, StopCircle
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import InteractiveWhiteboard from "./InteractiveWhiteboard";
import { LiveRoom, SessionRecording } from "../types";

// ── Types ──────────────────────────────────────────────────
interface Participant {
  socketId: string;
  name: string;
  isAdmin: boolean;
  hasVideoPermission: boolean;
  hasAudioPermission: boolean;
  joinedAt: number;
}
interface ChatMsg { id: string; name: string; isAdmin: boolean; text: string; time: string; }
interface WaitingEntry { socketId: string; name: string; requestedAt: number; }
interface PeerNegotiationState {
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  ignoreOffer: boolean;
  needsNegotiation: boolean;
  polite: boolean;
}

interface Props {
  room: LiveRoom;
  isAdmin: boolean;
  userName: string;
  onBack: () => void;
  onSaveRecording?: (rec: SessionRecording) => void;
}

// ── Browser capability detection ───────────────────────────
// Safe mediaDevices getter — undefined on HTTP or old browsers
function getMediaDevices(): MediaDevices | null {
  if (typeof navigator === "undefined") return null;
  if (navigator.mediaDevices) return navigator.mediaDevices;
  // Legacy fallback for very old browsers
  const legacyGUM =
    (navigator as unknown as Record<string, unknown>).getUserMedia ??
    (navigator as unknown as Record<string, unknown>).webkitGetUserMedia ??
    (navigator as unknown as Record<string, unknown>).mozGetUserMedia;
  if (legacyGUM) {
    // Polyfill mediaDevices stub with getUserMedia only
    const stub = {
      getUserMedia: (c: MediaStreamConstraints) =>
        new Promise<MediaStream>((res, rej) =>
          (legacyGUM as (c: MediaStreamConstraints, ok: (s: MediaStream) => void, err: (e: Error) => void) => void)
            .call(navigator, c, res, rej)),
    };
    return stub as unknown as MediaDevices;
  }
  return null;
}

function canScreenShare(): boolean {
  const md = getMediaDevices();
  return !!md && typeof (md as unknown as Record<string, unknown>).getDisplayMedia === "function";
}

// Clipboard copy with execCommand fallback for Safari / older browsers
function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    ok ? resolve() : reject(new Error("execCommand copy failed"));
  });
}
function supportsFullscreen(): boolean {
  return !!(
    document.documentElement.requestFullscreen ||
    (document.documentElement as unknown as Record<string, unknown>).webkitRequestFullscreen ||
    (document.documentElement as unknown as Record<string, unknown>).mozRequestFullScreen ||
    (document.documentElement as unknown as Record<string, unknown>).msRequestFullscreen
  );
}
function requestFullscreen(el: HTMLElement) {
  const e = el as unknown as Record<string, ((opts?: FullscreenOptions) => Promise<void>) | undefined>;
  const fn = el.requestFullscreen ?? e.webkitRequestFullscreen ?? e.mozRequestFullScreen ?? e.msRequestFullscreen;
  fn?.call(el);
}
function exitFullscreen() {
  const d = document as unknown as Record<string, (() => Promise<void>) | undefined>;
  const fn = document.exitFullscreen ?? d.webkitExitFullscreen ?? d.mozCancelFullScreen ?? d.msExitFullscreen;
  fn?.call(document);
}
function getFullscreenElement(): Element | null {
  const d = document as unknown as Record<string, Element | null | undefined>;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? d.msFullscreenElement ?? null;
}

// ── STUN servers for WebRTC ────────────────────────────────
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:openrelay.metered.ca:80" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

export default function NativeLiveRoom({ room, isAdmin, userName, onBack, onSaveRecording }: Props) {
  // ── State ──────────────────────────────────────────────────
  const [socket, setSocket] = useState<Socket | null>(null);
  const [phase, setPhase] = useState<"connecting" | "connection-error" | "lobby-wait" | "in-room" | "rejected" | "kicked">("connecting");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [waiting, setWaiting] = useState<WaitingEntry[]>([]);
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [activePanel, setActivePanel] = useState<"chat" | "participants" | "whiteboard">("chat");
  const [handRaised, setHandRaised] = useState(false);
  const [handNotifs, setHandNotifs] = useState<{ socketId: string; name: string }[]>([]);

  // Media
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [hasScreen, setHasScreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [myVideoPermission, setMyVideoPermission] = useState(false);
  const [myAudioPermission, setMyAudioPermission] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);
  const roomContainerRef = useRef<HTMLDivElement>(null);

  // Link copy
  const [linkCopied, setLinkCopied] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Panel visibility (mobile)
  const [showSidePanel, setShowSidePanel] = useState(true);

  // Streams
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // WebRTC
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const negotiationStatesRef = useRef<Map<string, PeerNegotiationState>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const broadcastLink = `${window.location.origin}${window.location.pathname}#room-${room.roomCode}`;

  // ── Fullscreen event listener ──────────────────────────────
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!getFullscreenElement());
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("mozfullscreenchange", onChange);
    document.addEventListener("MSFullscreenChange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("mozfullscreenchange", onChange);
      document.removeEventListener("MSFullscreenChange", onChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!supportsFullscreen()) return;
    if (isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen(roomContainerRef.current ?? document.documentElement);
    }
  };

  // ── Chat auto-scroll ───────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  // ── WebRTC: create peer ────────────────────────────────────
  const createPeer = useCallback((s: Socket, remoteId: string): RTCPeerConnection => {
    peersRef.current.get(remoteId)?.close();
    negotiationStatesRef.current.delete(remoteId);
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peersRef.current.set(remoteId, pc);
    const negotiationState: PeerNegotiationState = {
      makingOffer: false,
      settingRemoteAnswer: false,
      ignoreOffer: false,
      needsNegotiation: false,
      polite: !isAdmin,
    };
    negotiationStatesRef.current.set(remoteId, negotiationState);

    const negotiate = async () => {
      if (!negotiationState.needsNegotiation || negotiationState.makingOffer || pc.signalingState !== "stable") return;
      negotiationState.needsNegotiation = false;
      negotiationState.makingOffer = true;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.localDescription) {
          s.emit("rtc:offer", { targetSocketId: remoteId, offer: pc.localDescription });
        }
      } catch (err) {
        negotiationState.needsNegotiation = true;
        const message = err instanceof Error ? err.message : String(err);
        setMediaError("تعذّر تهيئة اتصال الفيديو: " + message);
      } finally {
        negotiationState.makingOffer = false;
      }
    };

    pc.onnegotiationneeded = () => {
      negotiationState.needsNegotiation = true;
      void negotiate();
    };
    pc.onsignalingstatechange = () => {
      if (pc.signalingState === "stable" && negotiationState.needsNegotiation) {
        void negotiate();
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) s.emit("rtc:ice", { targetSocketId: remoteId, candidate: e.candidate.toJSON() });
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };
    pc.ontrack = (e) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        if (!next.has(remoteId)) next.set(remoteId, new MediaStream());
        e.streams[0]?.getTracks().forEach(t => next.get(remoteId)!.addTrack(t));
        return next;
      });
    };

    // The teacher initiates receive-capable transceivers even before camera
    // or microphone are enabled. Later track changes renegotiate automatically.
    if (isAdmin) {
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
      localStreamRef.current?.getTracks().forEach((track) => {
        try { pc.addTrack(track, localStreamRef.current!); } catch {}
      });
    }
    return pc;
  }, [isAdmin]);

  const initiateOffer = useCallback((s: Socket, targetSocketId: string) => {
    createPeer(s, targetSocketId);
  }, [createPeer]);

  const closePeer = (socketId: string) => {
    peersRef.current.get(socketId)?.close();
    peersRef.current.delete(socketId);
    negotiationStatesRef.current.delete(socketId);
    pendingIceCandidatesRef.current.delete(socketId);
    setRemoteStreams(prev => { const n = new Map(prev); n.delete(socketId); return n; });
  };

  const flushPendingIce = async (remoteId: string) => {
    const pc = peersRef.current.get(remoteId);
    if (!pc?.remoteDescription) return;
    const candidates = pendingIceCandidatesRef.current.get(remoteId) ?? [];
    pendingIceCandidatesRef.current.delete(remoteId);
    for (const candidate of candidates) {
      await pc.addIceCandidate(candidate).catch((err) => {
        const state = negotiationStatesRef.current.get(remoteId);
        if (!state?.ignoreOffer) {
          const message = err instanceof Error ? err.message : String(err);
          setMediaError("تعذّر تهيئة اتصال الشبكة: " + message);
        }
      });
    }
  };

  // ── Socket setup ───────────────────────────────────────────
  useEffect(() => {
    const s = io({ path: "/api/socket.io", transports: ["websocket", "polling"], reconnectionAttempts: 5 });
    setSocket(s);

    s.on("connect", () => {
      setConnectionError(null);
      if (isAdmin) s.emit("room:join-admin", { roomCode: room.roomCode, name: userName });
      else s.emit("room:request-entry", { roomCode: room.roomCode, name: userName });
    });

    s.on("connect_error", (error) => {
      setConnectionError(error.message || "تعذّر الاتصال بخدمة البث.");
      setPhase("connection-error");
    });

    s.on("disconnect", (reason) => {
      if (reason === "io server disconnect") {
        setConnectionError("انقطع الاتصال بخدمة البث. أعد المحاولة.");
        setPhase("connection-error");
      }
    });

    s.on("lobby:waiting", () => setPhase("lobby-wait"));
    s.on("room:rejected", () => setPhase("rejected"));
    s.on("room:kicked", () => setPhase("kicked"));

    s.on("room:joined", ({ participants: ps }: { participants: Participant[] }) => {
      setPhase("in-room");
      setParticipants(ps);
      const me = ps.find(p => p.socketId === s.id);
      if (me) { setMyVideoPermission(me.hasVideoPermission); setMyAudioPermission(me.hasAudioPermission); }
    });

    s.on("room:participants", (ps: Participant[]) => {
      setParticipants(ps);
      const me = ps.find(p => p.socketId === s.id);
      if (me) { setMyVideoPermission(me.hasVideoPermission); setMyAudioPermission(me.hasAudioPermission); }
    });

    s.on("room:user-joined", (p: Participant) => {
      setParticipants(prev => prev.find(x => x.socketId === p.socketId) ? prev : [...prev, p]);
      if (isAdmin && !p.isAdmin) setTimeout(() => initiateOffer(s, p.socketId), 600);
    });

    s.on("room:user-left", ({ socketId }: { socketId: string }) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
      closePeer(socketId);
    });

    s.on("lobby:list", (list: WaitingEntry[]) => setWaiting(list));
    s.on("lobby:knock", (entry: WaitingEntry) =>
      setWaiting(prev => [...prev.filter(w => w.socketId !== entry.socketId), entry]));

    s.on("room:video-permission", ({ allow }: { allow: boolean }) => {
      setMyVideoPermission(allow);
      if (!allow) stopVideo();
    });
    s.on("room:audio-permission", ({ allow }: { allow: boolean }) => {
      setMyAudioPermission(allow);
      if (!allow) stopAudio();
    });
    s.on("room:hand-raised", (data: { socketId: string; name: string }) =>
      setHandNotifs(prev => [data, ...prev.slice(0, 4)]));
    s.on("chat:message", (msg: ChatMsg) => setChatMsgs(prev => [...prev, msg]));

    // WebRTC signaling
    s.on("rtc:offer", async ({ from, offer }: { from: string; offer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from) ?? createPeer(s, from);
      const negotiationState = negotiationStatesRef.current.get(from);
      if (!negotiationState) return;

      const readyForOffer =
        !negotiationState.makingOffer &&
        (pc.signalingState === "stable" || negotiationState.settingRemoteAnswer);
      const offerCollision = offer.type === "offer" && !readyForOffer;
      negotiationState.ignoreOffer = !negotiationState.polite && offerCollision;
      if (negotiationState.ignoreOffer) return;

      try {
        negotiationState.settingRemoteAnswer = offer.type === "answer";
        await pc.setRemoteDescription(offer);
        negotiationState.settingRemoteAnswer = false;
        await flushPendingIce(from);

        if (offer.type === "offer") {
          await pc.setLocalDescription(await pc.createAnswer());
          if (pc.localDescription) {
            s.emit("rtc:answer", { targetSocketId: from, answer: pc.localDescription });
          }
        }
      } catch (err) {
        negotiationState.settingRemoteAnswer = false;
        const message = err instanceof Error ? err.message : String(err);
        setMediaError("تعذّر تهيئة اتصال الفيديو: " + message);
      }
    });

    s.on("rtc:answer", async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      const pc = peersRef.current.get(from);
      const negotiationState = negotiationStatesRef.current.get(from);
      if (!pc || !negotiationState || pc.signalingState === "stable") return;
      try {
        negotiationState.settingRemoteAnswer = true;
        await pc.setRemoteDescription(answer);
        negotiationState.settingRemoteAnswer = false;
        await flushPendingIce(from);
      } catch (err) {
        negotiationState.settingRemoteAnswer = false;
        const message = err instanceof Error ? err.message : String(err);
        setMediaError("تعذّر تهيئة اتصال الفيديو: " + message);
      }
    });

    s.on("rtc:ice", async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (!pc?.remoteDescription) {
        const pending = pendingIceCandidatesRef.current.get(from) ?? [];
        pending.push(candidate);
        pendingIceCandidatesRef.current.set(from, pending);
        return;
      }
      await pc.addIceCandidate(candidate).catch((err) => {
        const negotiationState = negotiationStatesRef.current.get(from);
        if (!negotiationState?.ignoreOffer) {
          const message = err instanceof Error ? err.message : String(err);
          setMediaError("تعذّر تهيئة اتصال الشبكة: " + message);
        }
      });
    });

    return () => {
      s.emit("room:leave", { roomCode: room.roomCode });
      s.disconnect();
      stopAllMedia();
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      negotiationStatesRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      if (isFullscreen) exitFullscreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach remote streams to video elements
  useEffect(() => {
    remoteStreams.forEach((stream, sid) => {
      const el = remoteVideoRefs.current.get(sid);
      if (el && el.srcObject !== stream) el.srcObject = stream;
    });
  }, [remoteStreams]);

  // ── Media helpers ──────────────────────────────────────────
  function addTracksToPeers(tracks: MediaStreamTrack[]) {
    peersRef.current.forEach((pc) => {
      tracks.forEach(t => { try { pc.addTrack(t, localStreamRef.current!); } catch {} });
    });
  }

  const toggleVideo = async () => {
    if (!isAdmin && !myVideoPermission) {
      setMediaError("لا يوجد لديك إذن لتشغيل الكاميرا. اطلب من المدير منح الإذن.");
      setTimeout(() => setMediaError(null), 4000);
      return;
    }
    if (hasVideo) { stopVideo(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      stream.getVideoTracks().forEach(t => { localStreamRef.current!.addTrack(t); });
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setHasVideo(true);
      addTracksToPeers(stream.getVideoTracks());
      setMediaError(null);
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMediaError("رفض المتصفح الوصول للكاميرا. يرجى السماح من إعدادات المتصفح ثم إعادة المحاولة.");
      } else if (e.name === "NotFoundError") {
        setMediaError("لا توجد كاميرا متصلة بالجهاز.");
      } else {
        setMediaError("تعذّر تشغيل الكاميرا: " + e.message);
      }
      setTimeout(() => setMediaError(null), 5000);
    }
  };

  const toggleAudio = async () => {
    if (!isAdmin && !myAudioPermission) {
      setMediaError("لا يوجد لديك إذن للميكروفون. اطلب من المدير منح الإذن.");
      setTimeout(() => setMediaError(null), 4000);
      return;
    }
    if (hasAudio) { stopAudio(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 }, video: false });
      if (!localStreamRef.current) localStreamRef.current = new MediaStream();
      stream.getAudioTracks().forEach(t => localStreamRef.current!.addTrack(t));
      setHasAudio(true);
      addTracksToPeers(stream.getAudioTracks());
      setMediaError(null);
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setMediaError("رفض المتصفح الوصول للميكروفون. يرجى السماح من إعدادات المتصفح.");
      } else {
        setMediaError("تعذّر تشغيل الميكروفون: " + e.message);
      }
      setTimeout(() => setMediaError(null), 5000);
    }
  };

  const toggleScreen = async () => {
    if (!isAdmin) return;
    if (hasScreen) { stopScreen(); return; }

    // ── No getDisplayMedia in this browser → camera fallback ──────
    if (!canScreenShare()) {
      // Try rear camera as a broadcast source fallback
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        screenStreamRef.current = stream;
        if (screenVideoRef.current) screenVideoRef.current.srcObject = stream;
        setHasScreen(true);
        setMediaError(null);
        addTracksToPeers(stream.getTracks());
        stream.getTracks().forEach(t => t.addEventListener("ended", () => {
          setHasScreen(false);
          screenStreamRef.current = null;
        }));
      } catch (err: unknown) {
        const e = err as Error;
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setMediaError("اسمح للمتصفح بالوصول للكاميرا من الإعدادات ثم أعد المحاولة.");
        } else if (e.name === "NotFoundError") {
          setMediaError("لا توجد كاميرا. مشاركة الشاشة غير مدعومة في هذا المتصفح.");
        } else {
          setMediaError("مشاركة الشاشة غير متوفرة: " + e.message);
        }
        setTimeout(() => setMediaError(null), 6000);
      }
      return;
    }

    // ── getDisplayMedia is available → real screen share ──────────
    let stream: MediaStream | null = null;

    // Attempt 1: screen video + system/tab audio
    try {
      stream = await (navigator.mediaDevices as unknown as {
        getDisplayMedia(c: object): Promise<MediaStream>;
      }).getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err1: unknown) {
      const e1 = err1 as Error;
      if (e1.name === "NotAllowedError" || e1.name === "AbortError") return; // user cancelled
      // Attempt 2: video only (Firefox sometimes rejects audio in getDisplayMedia)
      try {
        stream = await (navigator.mediaDevices as unknown as {
          getDisplayMedia(c: object): Promise<MediaStream>;
        }).getDisplayMedia({
          video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
      } catch (err2: unknown) {
        const e2 = err2 as Error;
        if (e2.name === "NotAllowedError" || e2.name === "AbortError") return;
        setMediaError("تعذّر مشاركة الشاشة: " + e2.message);
        setTimeout(() => setMediaError(null), 5000);
        return;
      }
    }

    if (!stream) return;

    screenStreamRef.current = stream;
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = stream;
      // Auto-play at full res
      screenVideoRef.current.play().catch(() => {});
    }
    setHasScreen(true);
    setMediaError(null);
    addTracksToPeers(stream.getTracks());

    // When the user stops sharing from the browser's built-in button
    stream.getVideoTracks().forEach(t => t.addEventListener("ended", () => {
      setHasScreen(false);
      screenStreamRef.current = null;
      if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    }));
  };

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = isMuted; });
    setIsMuted(v => !v);
  };

  function stopVideo() {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.stop(); localStreamRef.current!.removeTrack(t); });
    setHasVideo(false);
  }
  function stopAudio() {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.stop(); localStreamRef.current!.removeTrack(t); });
    setHasAudio(false);
    setIsMuted(false);
  }
  function stopScreen() {
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    if (screenVideoRef.current) screenVideoRef.current.srcObject = null;
    setHasScreen(false);
  }
  function stopAllMedia() { stopVideo(); stopAudio(); stopScreen(); }

  // ── Recording helpers ──────────────────────────────────────

  /** Detect best supported MIME type for MediaRecorder on this browser */
  function detectMimeType(): string {
    if (typeof MediaRecorder === "undefined") return "";
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=h264,opus",
      "video/webm",
      "video/mp4;codecs=h264,aac",
      "video/mp4",
    ];
    for (const m of candidates) {
      try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {}
    }
    return "";
  }

  /** Build a composite stream: video (screen > camera) + audio (mic) */
  function buildCompositeStream(): MediaStream | null {
    const tracks: MediaStreamTrack[] = [];

    // Prefer screen share video; fall back to camera
    const screenVidTracks = screenStreamRef.current?.getVideoTracks().filter(t => t.readyState === "live") ?? [];
    const cameraVidTracks = localStreamRef.current?.getVideoTracks().filter(t => t.readyState === "live") ?? [];
    const audioTracks = [
      ...(screenStreamRef.current?.getAudioTracks().filter(t => t.readyState === "live") ?? []),
      ...(localStreamRef.current?.getAudioTracks().filter(t => t.readyState === "live") ?? []),
    ];

    if (screenVidTracks.length > 0) tracks.push(screenVidTracks[0]!);
    else if (cameraVidTracks.length > 0) tracks.push(cameraVidTracks[0]!);

    if (audioTracks.length > 0) tracks.push(audioTracks[0]!);

    if (tracks.length === 0) return null;
    return new MediaStream(tracks);
  }

  // ── Recording ──────────────────────────────────────────────
  const startRecording = () => {
    if (typeof MediaRecorder === "undefined") {
      setMediaError("متصفحك لا يدعم التسجيل. استخدم Chrome أو Firefox أو Edge.");
      setTimeout(() => setMediaError(null), 5000);
      return;
    }

    const composite = buildCompositeStream();
    if (!composite) {
      setMediaError("شغّل الكاميرا أو شارك الشاشة أولاً لبدء التسجيل.");
      setTimeout(() => setMediaError(null), 4000);
      return;
    }

    const mimeType = detectMimeType();
    recordedChunksRef.current = [];

    let mr: MediaRecorder;
    try {
      mr = mimeType
        ? new MediaRecorder(composite, { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 })
        : new MediaRecorder(composite);
    } catch {
      try {
        mr = new MediaRecorder(composite);
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        setMediaError("تعذّر بدء التسجيل: " + msg);
        setTimeout(() => setMediaError(null), 5000);
        return;
      }
    }

    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mr.onerror = (e) => {
      const msg = (e as unknown as { error?: { message?: string } }).error?.message ?? "خطأ في التسجيل";
      setMediaError("فشل التسجيل: " + msg);
      stopRecording();
    };
    mr.onstop = () => saveRecording(mr.mimeType || mimeType);

    mr.start(500);
    mediaRecorderRef.current = mr;
    setIsRecording(true);
    recordingTimerRef.current = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
    setMediaError(null);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const saveRecording = (mimeType: string) => {
    if (recordedChunksRef.current.length === 0) {
      setMediaError("لم يتم تسجيل أي بيانات. تأكد من وجود فيديو/صوت نشط.");
      setTimeout(() => setMediaError(null), 5000);
      return;
    }
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const finalMime = mimeType || "video/webm";
    const blob = new Blob(recordedChunksRef.current, { type: finalMime });
    const url = URL.createObjectURL(blob);

    // Trigger download
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = `حلقة-${room.subjectName}-${new Date().toLocaleDateString("ar-TN")}.${ext}`;
    document.body.appendChild(a);
    a.click();
    // Cleanup after short delay
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 5000);

    const recDuration = recordingTime;
    const rec: SessionRecording = {
      id: `rec-${Date.now()}`,
      title: `حلقة ${room.subjectName} - ${room.level}`,
      subjectId: room.subjectId,
      level: room.level,
      stage: room.stage,
      duration: fmtTime(recDuration),
      fileSize: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
      url,
      recordedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
    };
    onSaveRecording?.(rec);
    setRecordingTime(0);
    recordedChunksRef.current = [];
  };

  // ── Admin actions ──────────────────────────────────────────
  const approveEntry = (sid: string) => {
    socket?.emit("lobby:approve", { roomCode: room.roomCode, targetSocketId: sid });
    setWaiting(prev => prev.filter(w => w.socketId !== sid));
  };
  const rejectEntry = (sid: string) => {
    socket?.emit("lobby:reject", { roomCode: room.roomCode, targetSocketId: sid });
    setWaiting(prev => prev.filter(w => w.socketId !== sid));
  };
  const kickUser = (sid: string) => socket?.emit("room:kick", { roomCode: room.roomCode, targetSocketId: sid });
  const grantVideo = (sid: string, allow: boolean) => socket?.emit("room:grant-video", { roomCode: room.roomCode, targetSocketId: sid, allow });
  const grantAudio = (sid: string, allow: boolean) => socket?.emit("room:grant-audio", { roomCode: room.roomCode, targetSocketId: sid, allow });

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket?.emit("chat:message", { roomCode: room.roomCode, text: chatInput.trim() });
    setChatInput("");
  };
  const raiseHand = () => {
    if (handRaised) return;
    setHandRaised(true);
    socket?.emit("room:raise-hand", { roomCode: room.roomCode });
    setTimeout(() => setHandRaised(false), 10000);
  };
  const copyLink = () => {
    navigator.clipboard?.writeText(broadcastLink).then(() => {
      setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500);
    });
  };
  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Phases: not in room yet ────────────────────────────────
  if (phase === "rejected") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center"><X className="w-8 h-8 text-red-600" /></div>
      <h3 className="font-black text-slate-900">تم رفض طلب دخولك</h3>
      <button onClick={onBack} className="bg-slate-800 text-white font-black px-6 py-3 rounded-2xl text-sm flex items-center gap-2"><ArrowRight className="w-4 h-4" /> الرجوع</button>
    </div>
  );

  if (phase === "kicked") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center"><LogOut className="w-8 h-8 text-amber-600" /></div>
      <h3 className="font-black text-slate-900">تم إخراجك من الغرفة</h3>
      <button onClick={onBack} className="bg-slate-800 text-white font-black px-6 py-3 rounded-2xl text-sm flex items-center gap-2"><ArrowRight className="w-4 h-4" /> الرجوع</button>
    </div>
  );

  if (phase === "lobby-wait") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 text-center">
      <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center border border-amber-200">
        <Users className="w-8 h-8 text-amber-600 animate-pulse" />
      </div>
      <div><h3 className="font-black text-slate-900 text-lg">في انتظار موافقة المدير</h3><p className="text-slate-500 text-sm mt-1">طلبك أُرسل للأستاذ فوزي. انتظر قليلاً...</p></div>
      <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-5 py-2.5 rounded-xl text-sm flex items-center gap-2"><ArrowRight className="w-4 h-4" /> رجوع</button>
    </div>
  );

  if (phase === "connecting") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-600 font-bold text-sm">جاري الاتصال بالغرفة...</p>
    </div>
  );

  if (phase === "connection-error") return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
      <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center"><X className="w-8 h-8 text-red-600" /></div>
      <h3 className="font-black text-slate-900">تعذّر الاتصال بغرفة البث</h3>
      <p className="max-w-md text-sm text-slate-600">{connectionError ?? "تحقق من اتصال الإنترنت ثم أعد المحاولة."}</p>
      <div className="flex gap-2">
        <button onClick={() => { setPhase("connecting"); setConnectionError(null); socket?.connect(); }} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 py-2.5 rounded-xl text-sm">إعادة المحاولة</button>
        <button onClick={onBack} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-5 py-2.5 rounded-xl text-sm flex items-center gap-2"><ArrowRight className="w-4 h-4" /> رجوع</button>
      </div>
    </div>
  );

  // ── IN ROOM ────────────────────────────────────────────────
  return (
    <div
      ref={roomContainerRef}
      className={`flex flex-col bg-slate-950 ${isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : "rounded-2xl overflow-hidden border border-slate-800"}`}
      style={{ height: isFullscreen ? "100vh" : "calc(100vh - 130px)", minHeight: 520 }}
      dir="rtl"
    >
      {/* ── Top bar ────────────────────────────────────────── */}
      <div className="bg-slate-900 border-b border-slate-800 px-3 py-2.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all shrink-0">
            <ArrowRight className="w-4 h-4 text-white" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping shrink-0" />
              <span className="font-black text-white text-sm truncate">{room.subjectName}</span>
              {isAdmin && <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full shrink-0">🛡️ مدير</span>}
            </div>
            <span className="text-slate-500 text-[10px] truncate block">{room.level}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isRecording && (
            <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-lg flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
              {fmtTime(recordingTime)}
            </span>
          )}
          <span className="text-slate-400 text-[10px] flex items-center gap-1 hidden sm:flex">
            <Users className="w-3 h-3" />{participants.length}
          </span>
          {/* Fullscreen toggle */}
          {supportsFullscreen() && (
            <button onClick={toggleFullscreen}
              className="w-8 h-8 rounded-xl bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-all"
              title={isFullscreen ? "خروج من ملء الشاشة" : "ملء الشاشة"}>
              {isFullscreen ? <Minimize className="w-4 h-4 text-white" /> : <Maximize className="w-4 h-4 text-white" />}
            </button>
          )}
          <button onClick={onBack} className="bg-red-600 hover:bg-red-700 text-white font-black text-[10px] px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-all">
            <X className="w-3 h-3" /> خروج
          </button>
        </div>
      </div>

      {/* ── Admin-only broadcast link ──────────────────────── */}
      {isAdmin && (
        <div className="bg-indigo-950 border-b border-indigo-900 px-3 py-1.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Shield className="w-3 h-3 text-indigo-400 shrink-0" />
            <span className="text-indigo-300 text-[10px] font-bold shrink-0">🔗 رابط البث (للمدير فقط):</span>
            <span className="text-white font-mono text-[10px] truncate max-w-xs hidden lg:block">{broadcastLink}</span>
          </div>
          <button onClick={copyLink}
            className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg transition-all shrink-0 ${linkCopied ? "bg-emerald-600 text-white" : "bg-indigo-700 hover:bg-indigo-600 text-white"}`}>
            {linkCopied ? <><CheckCircle className="w-3 h-3" /> نُسخ!</> : <><Copy className="w-3 h-3" /> نسخ</>}
          </button>
        </div>
      )}

      {/* ── Lobby notifications ────────────────────────────── */}
      {isAdmin && waiting.length > 0 && (
        <div className="bg-amber-950 border-b border-amber-900 px-3 py-2 space-y-1 shrink-0">
          <span className="text-amber-300 font-black text-[10px]">⏳ طلبات الدخول ({waiting.length})</span>
          <div className="flex flex-wrap gap-2">
            {waiting.map(w => (
              <div key={w.socketId} className="flex items-center gap-2 bg-amber-900/50 rounded-xl px-2.5 py-1.5 border border-amber-800">
                <span className="text-amber-100 font-bold text-[10px]">{w.name}</span>
                <button onClick={() => approveEntry(w.socketId)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[9px] px-2 py-0.5 rounded-lg">✓</button>
                <button onClick={() => rejectEntry(w.socketId)} className="bg-red-700 hover:bg-red-800 text-white font-black text-[9px] px-2 py-0.5 rounded-lg">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hand raised notification ───────────────────────── */}
      {isAdmin && handNotifs.length > 0 && (
        <div className="bg-yellow-950 border-b border-yellow-900 px-3 py-1.5 flex items-center gap-2 shrink-0">
          <Hand className="w-3.5 h-3.5 text-yellow-400 animate-bounce" />
          <span className="text-yellow-300 text-[10px] font-bold">{handNotifs[0]?.name} رفع يده</span>
          <button onClick={() => setHandNotifs([])} className="text-yellow-600 text-[10px] mr-auto hover:text-yellow-400">تجاهل</button>
        </div>
      )}

      {/* ── Media error banner ─────────────────────────────── */}
      {mediaError && (
        <div className="bg-red-950 border-b border-red-900 px-3 py-2 flex items-center gap-2 shrink-0">
          <Settings className="w-3.5 h-3.5 text-red-400 shrink-0 animate-spin" />
          <span className="text-red-300 text-[10px] font-bold flex-1">{mediaError}</span>
          <button onClick={() => setMediaError(null)} className="text-red-500 text-[10px]">✕</button>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* Video + whiteboard area */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Content */}
          <div className="flex-1 relative overflow-hidden bg-slate-950">
            {activePanel === "whiteboard" ? (
              <div className="absolute inset-0">
                <InteractiveWhiteboard isAdmin={isAdmin} socket={socket as never} roomCode={room.roomCode} />
              </div>

            ) : (isAdmin && hasScreen) ? (
              /* ── SCREEN SHARE: fullscreen main view ───────────────── */
              <div className="absolute inset-0 bg-black">
                <video
                  ref={screenVideoRef}
                  autoPlay muted playsInline
                  className="w-full h-full object-contain"
                />
                {/* Label */}
                <div className="absolute top-3 right-3 bg-purple-700/90 backdrop-blur text-white text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 pointer-events-none">
                  <Monitor className="w-3 h-3" /> مشاركة الشاشة
                </div>
                {/* Camera PiP — bottom-left corner */}
                {hasVideo && (
                  <div className="absolute bottom-3 left-3 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-2xl"
                    style={{ width: 160, aspectRatio: "16/9" }}>
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[8px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Shield className="w-2 h-2 text-indigo-400" /> {userName}
                    </div>
                  </div>
                )}
                {/* Stop sharing button */}
                <button
                  onClick={() => { stopScreen(); }}
                  className="absolute top-3 left-3 bg-red-600/90 hover:bg-red-600 backdrop-blur text-white text-[10px] font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all">
                  <MonitorOff className="w-3.5 h-3.5" /> إيقاف المشاركة
                </button>
              </div>

            ) : (
              /* ── NO SCREEN SHARE: grid of cameras ─────────────────── */
              <div className="absolute inset-0 flex flex-wrap gap-2 p-2 content-start overflow-auto">
                {/* Admin local camera */}
                {isAdmin && (
                  <div className="relative rounded-xl overflow-hidden bg-slate-800 border-2 border-indigo-500 shrink-0"
                    style={{ width: 280, aspectRatio: "16/9" }}>
                    {/* hidden screen video element (always mounted for ref) */}
                    <video ref={screenVideoRef} autoPlay muted playsInline className="hidden" />
                    <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                    {!hasVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                        <div className="w-14 h-14 bg-indigo-700 rounded-full flex items-center justify-center text-white font-black text-xl">
                          {userName[0]}
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Shield className="w-2.5 h-2.5 text-indigo-400" /> {userName}
                    </div>
                  </div>
                )}

                {/* Remote streams */}
                {Array.from(remoteStreams.entries()).map(([sid, _stream]) => {
                  const p = participants.find(x => x.socketId === sid);
                  return (
                    <div key={sid} className="relative rounded-xl overflow-hidden bg-slate-800 border-2 border-emerald-600 shrink-0"
                      style={{ width: 180, aspectRatio: "16/9" }}>
                      <video autoPlay playsInline className="w-full h-full object-cover"
                        ref={el => { if (el) { remoteVideoRefs.current.set(sid, el); el.srcObject = _stream; } }} />
                      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full truncate max-w-[80px]">
                        {p?.name ?? "مشارك"}
                      </div>
                    </div>
                  );
                })}

                {/* Viewer placeholder */}
                {!isAdmin && remoteStreams.size === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 gap-3">
                    <div className="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                      <VideoOff className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-400">في انتظار بث المدير...</p>
                    <p className="text-xs text-slate-600">{participants.find(p => p.isAdmin)?.name ?? "المدير لم يدخل بعد"}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Controls bar ───────────────────────────────── */}
          <div className="bg-slate-900 border-t border-slate-800 px-3 py-2.5 flex items-center justify-center gap-2 flex-wrap shrink-0">

            {/* Camera */}
            <button onClick={toggleVideo}
              disabled={!isAdmin && !myVideoPermission}
              title={hasVideo ? "إيقاف الكاميرا" : "تشغيل الكاميرا"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                !isAdmin && !myVideoPermission
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : hasVideo ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"
              }`}>
              {hasVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </button>

            {/* Microphone */}
            <button onClick={toggleAudio}
              disabled={!isAdmin && !myAudioPermission}
              title={hasAudio ? "كتم الميكروفون" : "تشغيل الميكروفون"}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                !isAdmin && !myAudioPermission
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                  : hasAudio ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"
              }`}>
              {hasAudio ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
            </button>

            {/* Mute toggle (when audio on) */}
            {hasAudio && (
              <button onClick={toggleMute} title={isMuted ? "رفع كتم الصوت" : "كتم الصوت"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isMuted ? "bg-amber-600 text-white" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            )}

            {/* Screen share — admin only */}
            {isAdmin && (
              <button
                onClick={toggleScreen}
                title={hasScreen ? "إيقاف مشاركة الشاشة" : canScreenShare() ? "مشاركة الشاشة" : "بث الكاميرا (بديل)"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
                  hasScreen
                    ? "bg-purple-600 hover:bg-purple-700 text-white"
                    : "bg-slate-700 hover:bg-slate-600 text-slate-300"
                }`}>
                {hasScreen ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                {/* Small camera icon overlay when API not available */}
                {!canScreenShare() && !hasScreen && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-slate-600 rounded-full border border-slate-900 flex items-center justify-center">
                    <Video className="w-2 h-2 text-amber-400" />
                  </span>
                )}
              </button>
            )}

            <div className="w-px h-7 bg-slate-700" />

            {/* Panel switcher */}
            <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-1">
              {(["chat", "participants", "whiteboard"] as const).map(p => (
                <button key={p} onClick={() => { setActivePanel(p); setShowSidePanel(true); }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${activePanel === p && showSidePanel ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
                  title={p === "chat" ? "الدردشة" : p === "participants" ? "المشاركون" : "السبورة"}>
                  {p === "chat" ? <MessageCircle className="w-4 h-4" /> : p === "participants" ? <Users className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                </button>
              ))}
            </div>

            {/* Raise hand */}
            {!isAdmin && (
              <button onClick={raiseHand} title="رفع اليد"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${handRaised ? "bg-yellow-500 text-slate-900 animate-bounce" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}>
                <Hand className="w-4 h-4" />
              </button>
            )}

            {/* Fullscreen shortcut */}
            {supportsFullscreen() && (
              <button onClick={toggleFullscreen} title={isFullscreen ? "إلغاء ملء الشاشة" : "ملء الشاشة"}
                className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all">
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            )}

            {/* Recording — admin only */}
            {isAdmin && (
              <button onClick={isRecording ? stopRecording : startRecording} title={isRecording ? "إيقاف التسجيل" : "تسجيل الحلقة"}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isRecording ? "bg-red-600 hover:bg-red-700 text-white animate-pulse" : "bg-slate-700 hover:bg-slate-600 text-slate-300"}`}>
                {isRecording ? <StopCircle className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Side panel ─────────────────────────────────────── */}
        <div className={`bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 transition-all ${showSidePanel && activePanel !== "whiteboard" ? "w-72" : "w-0 overflow-hidden"}`}>
          {/* Tabs */}
          <div className="flex border-b border-slate-800 shrink-0 text-[11px] font-black">
            {(["chat", "participants"] as const).map(p => (
              <button key={p} onClick={() => setActivePanel(p)}
                className={`flex-1 py-2.5 transition-all ${activePanel === p ? "bg-indigo-700 text-white" : "text-slate-500 hover:bg-slate-800 hover:text-slate-300"}`}>
                {p === "chat" ? `💬 الدردشة` : `👥 (${participants.length})`}
              </button>
            ))}
            <button onClick={() => setShowSidePanel(false)}
              className="w-8 flex items-center justify-center text-slate-600 hover:text-slate-400 text-xs">✕</button>
          </div>

          {/* Chat */}
          {activePanel === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
                {chatMsgs.map(msg => (
                  <div key={msg.id} className={`text-right rounded-xl px-2.5 py-2 ${msg.isAdmin ? "bg-indigo-900/50 border border-indigo-800" : "bg-slate-800"}`}>
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="text-[9px] text-slate-500">{msg.time}</span>
                      <span className={`text-[10px] font-black ${msg.isAdmin ? "text-indigo-400" : "text-slate-400"}`}>{msg.isAdmin ? `🛡️ ${msg.name}` : msg.name}</span>
                    </div>
                    <p className="text-xs text-slate-200">{msg.text}</p>
                  </div>
                ))}
                {chatMsgs.length === 0 && (
                  <div className="text-center text-slate-600 text-xs pt-6 flex flex-col items-center gap-2">
                    <MessageCircle className="w-8 h-8 text-slate-700" />
                    لا توجد رسائل بعد
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={sendChat} className="border-t border-slate-800 p-2 flex gap-2 shrink-0">
                <button type="submit" className="w-8 h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center justify-center shrink-0 transition-all">
                  <Send className="w-3.5 h-3.5" />
                </button>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="اكتب رسالة..."
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-right outline-none focus:border-indigo-500 text-slate-200 placeholder-slate-600 min-w-0" />
              </form>
            </>
          )}

          {/* Participants */}
          {activePanel === "participants" && (
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 min-h-0">
              {participants.map(p => (
                <div key={p.socketId} className={`rounded-xl p-2.5 border ${p.isAdmin ? "bg-indigo-950 border-indigo-800" : "bg-slate-800 border-slate-700"}`}>
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <div className="flex items-center gap-1">
                      {p.hasVideoPermission && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="كاميرا" />}
                      {p.hasAudioPermission && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="ميكروفون" />}
                    </div>
                    <div className="flex items-center gap-1">
                      {p.isAdmin && <Shield className="w-3 h-3 text-indigo-400" />}
                      <span className="text-[11px] font-bold text-slate-200 truncate max-w-[110px]">{p.name}</span>
                    </div>
                  </div>
                  {isAdmin && !p.isAdmin && (
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => grantVideo(p.socketId, !p.hasVideoPermission)}
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 transition-all ${p.hasVideoPermission ? "bg-emerald-800 text-emerald-200" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                        <VideoIcon className="w-2.5 h-2.5" />{p.hasVideoPermission ? "سحب الكاميرا" : "منح الكاميرا"}
                      </button>
                      <button onClick={() => grantAudio(p.socketId, !p.hasAudioPermission)}
                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-lg flex items-center gap-0.5 transition-all ${p.hasAudioPermission ? "bg-blue-800 text-blue-200" : "bg-slate-700 text-slate-400 hover:bg-slate-600"}`}>
                        <MicIcon className="w-2.5 h-2.5" />{p.hasAudioPermission ? "سحب الميكروفون" : "منح الميكروفون"}
                      </button>
                      <button onClick={() => kickUser(p.socketId)}
                        className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-red-900 text-red-300 hover:bg-red-800 flex items-center gap-0.5 transition-all">
                        <UserX className="w-2.5 h-2.5" /> إخراج
                      </button>
                    </div>
                  )}
                  {!isAdmin && !p.isAdmin && (
                    <div className="flex items-center gap-1 text-[9px] text-slate-500">
                      <Eye className="w-3 h-3" />
                      <span>{p.hasVideoPermission || p.hasAudioPermission ? "مشارك نشط" : "مشاهد"}</span>
                    </div>
                  )}
                </div>
              ))}
              {participants.length === 0 && (
                <div className="text-center text-slate-600 text-xs pt-6 flex flex-col items-center gap-2">
                  <Users className="w-8 h-8 text-slate-700" />لا يوجد مشاركون
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel collapsed — show button ─────────────── */}
      {!showSidePanel && activePanel !== "whiteboard" && (
        <button
          onClick={() => setShowSidePanel(true)}
          className="absolute bottom-16 left-4 w-10 h-10 bg-slate-700 hover:bg-slate-600 text-white rounded-xl flex items-center justify-center shadow-lg transition-all z-10">
          {activePanel === "chat" ? <MessageCircle className="w-4 h-4" /> : <Users className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
