"use client";

import { useEffect } from "react";
import { supabase } from "../../lib/supabase";

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
  useEffect(() => {
    const registerPush = async () => {
      // Check if browser supports Service Workers and Push API
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const registration = await navigator.serviceWorker.ready;
        
        // Ask for permission if not already granted
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        } else if (Notification.permission === 'denied') {
          return; // Can't request again
        }

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!vapidPublicKey) {
            console.warn("VAPID public key not found in env. Ensure NEXT_PUBLIC_VAPID_PUBLIC_KEY is set.");
            return;
          }

          const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey
          });
        }

        const subJson = subscription.toJSON();
        
        if (subJson.endpoint && subJson.keys) {
          // Upsert the subscription to Supabase so the Edge Function can find it
          await supabase.from("push_subscriptions").upsert({
            user_id: session.user.id,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
          }, { onConflict: "endpoint" });
        }
      } catch (err) {
        console.error("Push registration failed", err);
      }
    };

    // Add a slight delay to avoid blocking main thread on mount
    const timeout = setTimeout(() => {
      registerPush();
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, []);

  return null; // Invisible component
}
