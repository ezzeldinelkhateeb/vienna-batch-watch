import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { settingsQueryKey } from "@/hooks/use-settings";

export interface ActiveSession {
  sessionId: string;
  userId: string;
  email: string;
  role: "admin" | "qc_staff";
  deviceType: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
  currentPath: string;
  onlineAt: string;
  lastSeen: string;
  isCurrentDevice?: boolean;
}

function parseClientDeviceInfo(): {
  deviceType: "mobile" | "tablet" | "desktop";
  os: string;
  browser: string;
} {
  if (typeof window === "undefined" || !navigator) {
    return { deviceType: "desktop", os: "Unknown", browser: "Browser" };
  }
  const ua = navigator.userAgent || "";
  let deviceType: "mobile" | "tablet" | "desktop" = "desktop";
  if (/iPad|Tablet|(android(?!.*mobile))/i.test(ua)) {
    deviceType = "tablet";
  } else if (/Mobi|Android|iPhone|iPod/i.test(ua)) {
    deviceType = "mobile";
  }

  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Macintosh|Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg/i.test(ua)) browser = "Edge";
  else if (/Chrome/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";
  else if (/Firefox/i.test(ua)) browser = "Firefox";

  return { deviceType, os, browser };
}

export function getClientSessionId(): string {
  if (typeof window === "undefined") return "server_session";
  try {
    let sid = sessionStorage.getItem("vienna_session_id");
    if (!sid) {
      sid = "sid_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
      sessionStorage.setItem("vienna_session_id", sid);
    }
    return sid;
  } catch {
    return "sid_fallback_" + Date.now();
  }
}

const PRESENCE_ROOM = "vienna-presence-room";

// --- Module-Level Singleton Presence State & Channel ---
type SessionListener = (sessions: ActiveSession[]) => void;
const listeners = new Set<SessionListener>();
let globalSessions: ActiveSession[] = [];
let singletonChannel: ReturnType<typeof supabase.channel> | null = null;
let activeSubscriberCount = 0;
let heartbeatInterval: any = null;

function notifyListeners() {
  const snapshot = [...globalSessions];
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (e) {
      console.error("[ActiveSessions] Listener error:", e);
    }
  }
}

function processPresenceState(presenceState: Record<string, any[]>, mySessionId: string): ActiveSession[] {
  if (!presenceState || typeof presenceState !== "object") {
    return [];
  }

  const list: ActiveSession[] = [];
  const seen = new Set<string>();

  try {
    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key];
      if (!Array.isArray(presences)) continue;

      for (const p of presences) {
        if (!p || typeof p !== "object" || !p.sessionId) continue;
        if (seen.has(p.sessionId)) continue;
        seen.add(p.sessionId);

        list.push({
          sessionId: String(p.sessionId),
          userId: String(p.userId || ""),
          email: String(p.email || "user@vienna.com"),
          role: p.role === "admin" ? "admin" : "qc_staff",
          deviceType: p.deviceType || "desktop",
          os: String(p.os || "Unknown"),
          browser: String(p.browser || "Browser"),
          currentPath: String(p.currentPath || "/"),
          onlineAt: String(p.onlineAt || new Date().toISOString()),
          lastSeen: String(p.lastSeen || new Date().toISOString()),
          isCurrentDevice: p.sessionId === mySessionId,
        });
      }
    }

    // Sort: current device first, then newest
    list.sort((a, b) => {
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      const tA = new Date(a.onlineAt).getTime() || 0;
      const tB = new Date(b.onlineAt).getTime() || 0;
      return tB - tA;
    });
  } catch (err) {
    console.error("[ActiveSessions] processPresenceState error:", err);
  }

  return list;
}

export function useActiveSessions() {
  const { user, isAdmin, isPrimaryAdmin } = useAuth();
  const queryClient = useQueryClient();
  const mySessionId = getClientSessionId();

  const [sessions, setSessions] = useState<ActiveSession[]>(() => {
    if (globalSessions.length > 0) return globalSessions;
    if (user) {
      const dev = parseClientDeviceInfo();
      return [
        {
          sessionId: mySessionId,
          userId: user.id,
          email: user.email || "user@vienna.com",
          role: isAdmin ? "admin" : "qc_staff",
          deviceType: dev.deviceType,
          os: dev.os,
          browser: dev.browser,
          currentPath: typeof window !== "undefined" ? window.location.pathname : "/",
          onlineAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          isCurrentDevice: true,
        },
      ];
    }
    return [];
  });

  const [activeCount, setActiveCount] = useState<number>(sessions.length);

  // Subscribe to module-level listener
  useEffect(() => {
    const handleUpdate = (updated: ActiveSession[]) => {
      setSessions(updated);
      setActiveCount(updated.length);
    };

    listeners.add(handleUpdate);
    if (globalSessions.length > 0) {
      handleUpdate(globalSessions);
    }

    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // Manage singleton Realtime channel lifecycle
  useEffect(() => {
    if (!user) return;

    activeSubscriberCount++;

    const initSingleton = async () => {
      if (!singletonChannel) {
        try {
          const deviceInfo = parseClientDeviceInfo();
          const onlineAt = new Date().toISOString();

          const channel = supabase.channel(PRESENCE_ROOM, {
            config: {
              presence: {
                key: mySessionId,
              },
            },
          });

          singletonChannel = channel;

          const sync = () => {
            try {
              if (singletonChannel) {
                const state = singletonChannel.presenceState();
                globalSessions = processPresenceState(state, mySessionId);
                notifyListeners();
              }
            } catch (err) {
              console.error("[ActiveSessions] sync error:", err);
            }
          };

          channel
            .on("presence", { event: "sync" }, sync)
            .on("presence", { event: "join" }, sync)
            .on("presence", { event: "leave" }, sync)
            .on("broadcast", { event: "FORCE_LOGOUT" }, async ({ payload }) => {
              if (!payload) return;

              const isTargetSession = payload.targetSessionId === mySessionId;
              const isTargetUser = payload.targetUserId === user.id && !isPrimaryAdmin;
              const isKickAll = payload.kickAllOthers && mySessionId !== payload.initiatorSessionId && !isPrimaryAdmin;

              if (isTargetSession || isTargetUser || isKickAll) {
                toast.error("تم إنهاء جلستك وإخراجك من المنظومة بواسطة مسؤول النظام 🔒", {
                  duration: 8000,
                });
                try {
                  await supabase.auth.signOut();
                } catch {
                  // ignore
                } finally {
                  if (typeof window !== "undefined") {
                    window.location.href = "/auth";
                  }
                }
              }
            })
            .on("broadcast", { event: "APP_LOCK_TOGGLE" }, () => {
              void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
            })
            .subscribe(async (status) => {
              if (status === "SUBSCRIBED" && singletonChannel) {
                try {
                  await singletonChannel.track({
                    sessionId: mySessionId,
                    userId: user.id,
                    email: user.email || "user@vienna.com",
                    role: isAdmin ? "admin" : "qc_staff",
                    deviceType: deviceInfo.deviceType,
                    os: deviceInfo.os,
                    browser: deviceInfo.browser,
                    currentPath: typeof window !== "undefined" ? window.location.pathname : "/",
                    onlineAt,
                    lastSeen: new Date().toISOString(),
                  });
                } catch (trackErr) {
                  console.warn("[ActiveSessions] track error:", trackErr);
                }
              }
            });

          // Periodic heartbeat to refresh presence every 45s
          if (!heartbeatInterval) {
            heartbeatInterval = setInterval(() => {
              if (singletonChannel && user) {
                const currentDev = parseClientDeviceInfo();
                singletonChannel
                  .track({
                    sessionId: mySessionId,
                    userId: user.id,
                    email: user.email || "user@vienna.com",
                    role: isAdmin ? "admin" : "qc_staff",
                    deviceType: currentDev.deviceType,
                    os: currentDev.os,
                    browser: currentDev.browser,
                    currentPath: typeof window !== "undefined" ? window.location.pathname : "/",
                    onlineAt,
                    lastSeen: new Date().toISOString(),
                  })
                  .catch((e) => console.warn("[ActiveSessions] Heartbeat track error:", e));
              }
            }, 45 * 1000);
          }
        } catch (setupErr) {
          console.error("[ActiveSessions] Channel setup error:", setupErr);
        }
      }
    };

    void initSingleton();

    return () => {
      activeSubscriberCount--;
      // Keep channel alive for smooth navigation across tabs unless all subscribers unmount for extended time
      if (activeSubscriberCount <= 0) {
        activeSubscriberCount = 0;
      }
    };
  }, [user, isAdmin, mySessionId, queryClient]);

  // Admin Kick action for a single session
  const kickSession = async (targetSessionId: string, targetEmail?: string) => {
    if (!isAdmin) {
      toast.error("هذه الصلاحية متاحة للمسؤولين فقط");
      return;
    }
    if (targetSessionId === mySessionId) {
      toast.info("لا يمكنك إخراج جلستك الحالية من هنا. استخدم زر تسجيل الخروج");
      return;
    }

    try {
      const channel = singletonChannel || supabase.channel(PRESENCE_ROOM);
      await channel.send({
        type: "broadcast",
        event: "FORCE_LOGOUT",
        payload: {
          targetSessionId,
          initiatorSessionId: mySessionId,
          adminEmail: user?.email,
        },
      });

      // Optimistically update
      globalSessions = globalSessions.filter((s) => s.sessionId !== targetSessionId);
      notifyListeners();

      toast.success(
        targetEmail
          ? `تم إنهاء جلسة (${targetEmail}) وإخراجه بنجاح ✅`
          : "تم إخراج الجهاز بنجاح ✅",
      );
    } catch (err) {
      console.error("Kick session error:", err);
      toast.error("تعذر إرسال أمر إنهاء الجلسة");
    }
  };

  // Admin Kick all sessions for a specific user ID
  const kickUser = async (targetUserId: string, targetEmail?: string) => {
    if (!isAdmin) {
      toast.error("هذه الصلاحية متاحة للمسؤولين فقط");
      return;
    }
    if (targetUserId === user?.id) {
      toast.info("لا يمكنك إخراج حسابك الحالي من هنا. استخدم زر تسجيل الخروج");
      return;
    }

    try {
      const channel = singletonChannel || supabase.channel(PRESENCE_ROOM);
      await channel.send({
        type: "broadcast",
        event: "FORCE_LOGOUT",
        payload: {
          targetUserId,
          initiatorSessionId: mySessionId,
          adminEmail: user?.email,
        },
      });

      // Filter out target user from active sessions
      globalSessions = globalSessions.filter((s) => s.userId !== targetUserId);
      notifyListeners();

      toast.success(
        targetEmail
          ? `تم إنهاء جلسة (${targetEmail}) وإخراجه بنجاح ✅`
          : "تم إنهاء جلسة المستخدم وإخراجه بنجاح ✅",
      );
    } catch (err) {
      console.error("Kick user error:", err);
      toast.error("تعذر إرسال أمر إنهاء الجلسة");
    }
  };

  // Admin Kick all other non-admin sessions
  const kickAllOthers = async () => {
    if (!isAdmin) {
      toast.error("هذه الصلاحية متاحة للمسؤولين فقط");
      return;
    }

    try {
      const channel = singletonChannel || supabase.channel(PRESENCE_ROOM);
      await channel.send({
        type: "broadcast",
        event: "FORCE_LOGOUT",
        payload: {
          kickAllOthers: true,
          initiatorSessionId: mySessionId,
          adminEmail: user?.email,
        },
      });

      // Filter out everyone except current device
      globalSessions = globalSessions.filter((s) => s.isCurrentDevice);
      notifyListeners();

      toast.success("تم إنهاء جلسات جميع المستخدمين وإخراجهم بنجاح 🔒");
    } catch (err) {
      console.error("Kick all error:", err);
      toast.error("تعذر إرسال أمر إخراج المستخدمين");
    }
  };

  // Broadcast app lock change to all clients
  const broadcastAppLock = async (isLocked: boolean) => {
    try {
      const channel = singletonChannel || supabase.channel(PRESENCE_ROOM);
      await channel.send({
        type: "broadcast",
        event: "APP_LOCK_TOGGLE",
        payload: { isLocked },
      });
    } catch (e) {
      console.error("Broadcast lock error:", e);
    }
  };

  return {
    sessions,
    activeCount,
    kickSession,
    kickUser,
    kickAllOthers,
    broadcastAppLock,
    mySessionId,
  };
}
