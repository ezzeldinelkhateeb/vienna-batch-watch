import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "vienna_notifications_last_read_at";
const EVENT_KEY = "vienna:notifications_read";

export function getNotificationsLastReadAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setNotificationsLastReadAt(isoString?: string): void {
  if (typeof window === "undefined") return;
  const val = isoString || new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, val);
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: val }));
}

export function useNotificationsBadge() {
  const queryClient = useQueryClient();
  const [lastReadAt, setLastReadAt] = useState<string | null>(getNotificationsLastReadAt);

  // Listen for read updates across components/tabs
  useEffect(() => {
    const handleReadEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setLastReadAt(customEvent.detail || new Date().toISOString());
      void queryClient.invalidateQueries({ queryKey: ["notifications_unread_badge"] });
    };

    window.addEventListener(EVENT_KEY, handleReadEvent);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        setLastReadAt(e.newValue);
        void queryClient.invalidateQueries({ queryKey: ["notifications_unread_badge"] });
      }
    });

    return () => {
      window.removeEventListener(EVENT_KEY, handleReadEvent);
    };
  }, [queryClient]);

  const badgeQuery = useQuery({
    queryKey: ["notifications_unread_badge", lastReadAt],
    queryFn: async () => {
      // 1. If we have a lastReadAt timestamp, check for alerts logged after that time
      if (lastReadAt) {
        const { count: logCount, error: logErr } = await supabase
          .from("notification_log")
          .select("*", { count: "exact", head: true })
          .gt("created_at", lastReadAt);

        if (!logErr && typeof logCount === "number") {
          // Check items created/updated after lastReadAt with critical/expired status
          const targetDate = new Date();
          targetDate.setDate(targetDate.getDate() + 30);
          const limitStr = targetDate.toISOString().slice(0, 10);

          const { count: newItemsCount, error: itemsErr } = await supabase
            .from("items")
            .select("*", { count: "exact", head: true })
            .lte("expiry_date", limitStr)
            .gt("created_at", lastReadAt);

          const totalUnread = (logCount || 0) + (!itemsErr ? (newItemsCount || 0) : 0);
          return totalUnread;
        }
      }

      // 2. Initial state if user has never visited notifications page yet:
      // Count existing logs, or up to items expiring soon
      const { count: initialLogCount, error: initialLogErr } = await supabase
        .from("notification_log")
        .select("*", { count: "exact", head: true });

      if (!initialLogErr && typeof initialLogCount === "number" && initialLogCount > 0) {
        return initialLogCount;
      }

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 30);
      const limitStr = targetDate.toISOString().slice(0, 10);

      const { count, error } = await supabase
        .from("items")
        .select("*", { count: "exact", head: true })
        .lte("expiry_date", limitStr);

      if (error) return 0;
      return count ?? 0;
    },
    staleTime: 15 * 1000,
  });

  const markAllAsRead = useCallback(() => {
    setNotificationsLastReadAt();
    setLastReadAt(new Date().toISOString());
    void queryClient.invalidateQueries({ queryKey: ["notifications_unread_badge"] });
  }, [queryClient]);

  return {
    unreadCount: badgeQuery.data ?? 0,
    markAllAsRead,
    isLoading: badgeQuery.isLoading,
  };
}
