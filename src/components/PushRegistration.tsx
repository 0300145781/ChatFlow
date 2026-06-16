"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { BellRing, X } from "lucide-react";

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export default function PushRegistration() {
  const [permission, setPermission] = useState<NotificationPermission | "loading">("loading");
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const initPush = async () => {
      if (!('Notification' in window)) return;
      
      const currentPermission = Notification.permission;
      setPermission(currentPermission);
      
      if (currentPermission === 'default') {
        setShowBanner(true);
      }

      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('/sw.js');
          
          // If permission is ALREADY granted, quietly subscribe in the background
          if (currentPermission === 'granted') {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
              const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
              if (vapidPublicKey) {
                subscription = await registration.pushManager.subscribe({
                  userVisibleOnly: true,
                  applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
                });
              }
            }

            if (subscription) {
              const subJson = subscription.toJSON();
              if (subJson.endpoint && subJson.keys) {
                await supabase.from("push_subscriptions").upsert({
                  user_id: session.user.id,
                  endpoint: subJson.endpoint,
                  p256dh: subJson.keys.p256dh,
                  auth: subJson.keys.auth,
                }, { onConflict: "endpoint" });
              }
            }
          }
        } catch (err) {
          console.error("Background push registration error:", err);
        }
      }
    };

    initPush();
  }, []);

  const handleEnableNotifications = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert("Push notifications are not supported in your browser.");
        return;
      }

      // MUST be triggered by a user click event to bypass browser security blocks!
      const perm = await Notification.requestPermission();
      setPermission(perm);
      
      if (perm !== 'granted') {
        setShowBanner(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          console.warn("VAPID public key not found in env.");
          alert("VAPID Key missing from environment variables.");
          return;
        }
        
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
        });
      }

      const subJson = subscription.toJSON();
      if (subJson.endpoint && subJson.keys) {
        await supabase.from("push_subscriptions").upsert({
          user_id: session.user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth,
        }, { onConflict: "endpoint" });
      }
      
      setShowBanner(false);
    } catch (err) {
      console.error("Push registration failed", err);
      alert("Failed to enable notifications. Please try again.");
    }
  };

  if (!showBanner || permission !== 'default') return null;

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] bg-white dark:bg-[#202020] border border-border shadow-2xl rounded-full px-5 py-3 flex items-center gap-5 text-sm animate-in slide-in-from-top-10 fade-in duration-300">
      <div className="flex items-center gap-2.5 text-foreground">
        <BellRing className="w-4 h-4 text-primary animate-pulse" />
        <span className="font-medium">Turn on notifications for new messages</span>
      </div>
      <div className="flex items-center gap-2 border-l border-border pl-4">
        <button 
          onClick={handleEnableNotifications}
          className="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-1.5 rounded-full font-medium transition-colors shadow-sm"
        >
          Enable
        </button>
        <button 
          onClick={() => setShowBanner(false)} 
          className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
