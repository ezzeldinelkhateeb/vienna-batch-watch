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
  let sid = sessionStorage.getItem("vienna_session_id");
  if (!sid) {
    sid = "sid_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem("vienna_session_id", sid);
  }
  return sid;
}

const PRESENCE_ROOM = "vienna-presence-room";

export function useActiveSessions() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [activeCount, setActiveCount] = useState<number>(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const mySessionId = getClientSessionId();

  // Helper to re-aggregate presence state
  const syncPresenceState = useCallback((presenceState: Record<string, any[]>) => {
    const list: ActiveSession[] = [];
    const seen = new Set<string>();

    for (const key of Object.keys(presenceState)) {
      const presences = presenceState[key] || [];
      for (const p of presences) {
        if (!p || !p.sessionId) continue;
        if (seen.has(p.sessionId)) continue;
        seen.add(p.sessionId);

        list.push({
          sessionId: p.sessionId,
          userId: p.userId,
          email: p.email,
          role: p.role || "qc_staff",
          deviceType: p.deviceType || "desktop",
          os: p.os || "Unknown",
          browser: p.browser || "Browser",
          currentPath: p.currentPath || "/",
          onlineAt: p.onlineAt || new Date().toISOString(),
          lastSeen: p.lastSeen || new Date().toISOString(),
          isCurrentDevice: p.sessionId === mySessionId,
        });
      }
    }

    // Sort: current device first, then newest
    list.sort((a, b) => {
      if (a.isCurrentDevice) return -1;
      if (b.isCurrentDevice) return 1;
      return new Date(b.onlineAt).getTime() - new Date(a.onlineAt).getTime();
    });

    setSessions(list);
    setActiveCount(list.length);
  }, [mySessionId]);

  useEffect(() => {
    if (!user) return;

    const deviceInfo = parseClientDeviceInfo();
    const onlineAt = new Date().toISOString();

    const channel = supabase.channel(PRESENCE_ROOM, {
      config: {
        presence: {
          key: mySessionId,
        },
      },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        syncPresenceState(state);
      })
      .on("presence", { event: "join" }, () => {
        const state = channel.presenceState();
        syncPresenceState(state);
      })
      .on("presence", { event: "leave" }, () => {
        const state = channel.presenceState();
        syncPresenceState(state);
      })
      .on("broadcast", { event: "FORCE_LOGOUT" }, async ({ payload }) => {
        if (!payload) return;

        const isTargetSession = payload.targetSessionId === mySessionId;
        const isTargetUser = payload.targetUserId === user.id && !isAdmin;
        const isKickAll = payload.kickAllOthers && mySessionId !== payload.initiatorSessionId && !isAdmin;

        if (isTargetSession || isTargetUser || isKickAll) {
          toast.error("تم إنهاء جلستك وإخراجك من المنظومة بواسطة مسؤول النظام 🔒", {
            duration: 8000,
          });
          try {
            await supabase.auth.signOut();
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
        if (status === "SUBSCRIBED") {
          await channel.track({
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
        }
      });

    // Periodic heartbeat to refresh presence
    const interval = setInterval(() => {
      if (channelRef.current && user) {
        void channelRef.current.track({
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
      }
    }, 45 * 1000);

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [user, isAdmin, mySessionId, syncPresenceState, queryClient]);

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
      const channel = channelRef.current || supabase.channel(PRESENCE_ROOM);
      await channel.send({
        type: "broadcast",
        event: "FORCE_LOGOUT",
        payload: {
          targetSessionId,
          initiatorSessionId: mySessionId,
          adminEmail: user?.email,
        },
      });

      // Optimistically filter from local state
      setSessions((prev) => prev.filter((s) => s.sessionId !== targetSessionId));
      setActiveCount((prev) => Math.max(0, prev - 1));

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

  // Admin Kick all other non-admin sessions
  const kickAllOthers = async () => {
    if (!isAdmin) {
      toast.error("هذه الصلاحية متاحة للمسؤولين فقط");
      return;
    }

    try {
      const channel = channelRef.current || supabase.channel(PRESENCE_ROOM);
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
      setSessions((prev) => prev.filter((s) => s.isCurrentDevice));
      setActiveCount(1);

      toast.success("تم إنهاء جلسات جميع المستخدمين وإخراجهم بنجاح 🔒");
    } catch (err) {
      console.error("Kick all error:", err);
      toast.error("تعذر إرسال أمر إخراج المستخدمين");
    }
  };

  // Broadcast app lock change to all clients
  const broadcastAppLock = async (isLocked: boolean) => {
    try {
      const channel = channelRef.current || supabase.channel(PRESENCE_ROOM);
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
    kickAllOthers,
    broadcastAppLock,
    mySessionId,
  };
}
