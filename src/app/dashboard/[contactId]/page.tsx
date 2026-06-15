"use client";

import { useEffect, useState, use, useRef } from "react";
import { supabase } from "../../../../lib/supabase";
import { useRouter } from "next/navigation";
import ChatInterface from "../../../components/ChatInterface";
import CallManager, { CallManagerRef } from "../../../components/CallManager";
import { User, ChevronLeft, Phone, Video } from "lucide-react";
import Link from "next/link";

export default function ChatPage({ params }: { params: Promise<{ contactId: string }> }) {
  const resolvedParams = use(params);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [contactInfo, setContactInfo] = useState<{ name: string | null; friend_code: string; avatar_url: string | null } | null>(null);
  const callManagerRef = useRef<CallManagerRef>(null);
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/");
        return;
      }
      setCurrentUser(session.user);

      const { data: contactData } = await supabase
        .from("contacts")
        .select("name")
        .eq("user_id", session.user.id)
        .eq("contact_user_id", resolvedParams.contactId)
        .single();

      const { data: profileData } = await supabase
        .from("profiles")
        .select("friend_code, avatar_url")
        .eq("id", resolvedParams.contactId)
        .single();

      setContactInfo({
        name: contactData?.name || null,
        friend_code: profileData?.friend_code || "Unknown",
        avatar_url: profileData?.avatar_url || null,
      });
    };

    init();
  }, [resolvedParams.contactId, router]);

  if (!currentUser || !contactInfo) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-16 border-b border-border bg-white/80 dark:bg-[#111111]/80 backdrop-blur-md flex items-center px-4 md:px-6 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="md:hidden p-2 -ml-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <ChevronLeft className="w-6 h-6 text-foreground" />
          </Link>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
            {contactInfo.avatar_url ? (
              <img src={contactInfo.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-foreground/70" />
            )}
          </div>
          <div>
            <h2 className="font-medium text-foreground leading-tight">
              {contactInfo.name || `User ${contactInfo.friend_code}`}
            </h2>
            <p className="text-xs text-muted-foreground font-mono">
              #{contactInfo.friend_code}
            </p>
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          <button 
            onClick={() => callManagerRef.current?.startCall("audio")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            title="Start Audio Call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button 
            onClick={() => callManagerRef.current?.startCall("video")}
            className="w-10 h-10 rounded-full flex items-center justify-center text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
            title="Start Video Call"
          >
            <Video className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      <div className="flex-1 min-h-0">
        <ChatInterface currentUserId={currentUser.id} contactId={resolvedParams.contactId} />
      </div>
      
      <CallManager 
        ref={callManagerRef}
        currentUserId={currentUser.id} 
        contactId={resolvedParams.contactId}
        contactName={contactInfo.name || `User ${contactInfo.friend_code}`}
        contactAvatar={contactInfo.avatar_url}
      />
    </div>
  );
}
