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
  console.log("Edge Function invoked! Processing Webhook...");
  try {
    const payload = await req.json();
    console.log("Webhook Payload received:", JSON.stringify(payload));
    
    const record = payload.record;

    if (!record || !record.sender_id || (!record.receiver_id && !record.group_id)) {
      console.error("Invalid payload missing required fields");
      return new Response("Invalid payload", { status: 400 });
    }

    const isGroup = !!record.group_id;
    console.log(`Processing new message from ${record.sender_id} to ${isGroup ? 'Group ' + record.group_id : 'User ' + record.receiver_id}`);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: senderData } = await supabaseClient
      .from('profiles')
      .select('friend_code, name')
      .eq('id', record.sender_id)
      .single();

    let senderName = senderData?.name || (senderData?.friend_code ? `User #${senderData.friend_code}` : "Someone");
    let groupName = "";
    
    let targetUserIds: string[] = [];

    if (isGroup) {
      // Fetch group name
      const { data: groupData } = await supabaseClient
        .from('groups')
        .select('name')
        .eq('id', record.group_id)
        .single();
      
      if (groupData) groupName = groupData.name;

      // Fetch all group members EXCEPT the sender
      const { data: members } = await supabaseClient
        .from('group_members')
        .select('user_id')
        .eq('group_id', record.group_id)
        .neq('user_id', record.sender_id);
        
      if (members) {
        targetUserIds = members.map(m => m.user_id);
      }
    } else {
      targetUserIds = [record.receiver_id];
    }

    if (targetUserIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No recipients found" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    console.log(`Fetching subscriptions for ${targetUserIds.length} users...`);

    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .in('user_id', targetUserIds);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No subscriptions found" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    const title = isGroup ? `New message in ${groupName}` : `New message from ${senderName}`;
    const url = isGroup ? `/dashboard/${record.group_id}` : `/dashboard/${record.sender_id}`;

    const notificationPayload = JSON.stringify({
      title,
      body: isGroup ? `${senderName}: You have a new encrypted message.` : "You have received a new encrypted message.",
      url
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
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`Deleting invalid subscription ${sub.id}`);
            await supabaseClient.from('push_subscriptions').delete().eq('id', sub.id);
          }
        });
    });

    await Promise.all(sendPromises);
    console.log(`Dispatched ${subscriptions.length} pushes successfully.`);

    return new Response(JSON.stringify({ success: true, dispatched: subscriptions.length }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Webhook processing failed critically:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
