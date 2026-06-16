import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'npm:web-push@3.6.7'

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:support@chatflow.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record; // The inserted message row

    if (!record || !record.receiver_id || !record.sender_id) {
      return new Response("Invalid payload", { status: 400 });
    }

    // Initialize Supabase Client with Service Role to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Resolve Sender Identity for Notification
    // We fetch the receiver's contact list to see if they named the sender.
    const { data: contactData } = await supabaseClient
      .from('contacts')
      .select('name')
      .eq('user_id', record.receiver_id)
      .eq('contact_user_id', record.sender_id)
      .single();

    // Fallback to friend_code if no custom name exists
    const { data: senderData } = await supabaseClient
      .from('profiles')
      .select('friend_code')
      .eq('id', record.sender_id)
      .single();

    let senderName = "Someone";
    if (contactData && contactData.name) {
      senderName = contactData.name;
    } else if (senderData && senderData.friend_code) {
      senderName = `User #${senderData.friend_code}`;
    }

    // 2. Fetch all active push subscriptions for the receiver
    const { data: subscriptions } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', record.receiver_id);

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No subscriptions found" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // 3. Dispatch encrypted push payloads
    const notificationPayload = JSON.stringify({
      title: `New message from ${senderName}`,
      body: "You have received a new encrypted message.",
      url: `/dashboard/${record.sender_id}`
    });

    const sendPromises = subscriptions.map(sub => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      return webpush.sendNotification(pushSubscription, notificationPayload)
        .catch(async (error) => {
          console.error('Error sending push notification to endpoint:', sub.endpoint, error);
          // Auto-cleanup: If the subscription is expired or invalid, delete it from the database
          if (error.statusCode === 404 || error.statusCode === 410) {
            await supabaseClient
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          }
        });
    });

    await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true, dispatched: subscriptions.length }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Webhook processing failed:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
