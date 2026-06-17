"use client";

import { useEffect, useState, use, useRef } from "react";
import { supabase } from "../../../../lib/supabase";
import { useRouter } from "next/navigation";
import ChatInterface from "../../../components/ChatInterface";
import CallManager, { CallManagerRef } from "../../../components/CallManager";
import { User, ChevronLeft, Phone, Video, Lock, Pencil, MoreVertical, Ban, Trash2, Loader2 } from "lucide-react";
import Link from "next/link";
import RenameContactModal from "../../../components/RenameContactModal";
import GroupSettingsModal from "../../../components/GroupSettingsModal";

export default function ChatPage({ params }: { params: Promise<{ contactId: string }> }) {
  const resolvedParams = use(params);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isGroup, setIsGroup] = useState(false);
  const [contactInfo, setContactInfo] = useState<{ name: string | null; friend_code: string; avatar_url: string | null; public_key?: string | null } | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const callManagerRef = useRef<CallManagerRef>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchContact = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/");
      return;
    }
    setCurrentUser(session.user);

    // Fetch my public key
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("public_key")
      .eq("id", session.user.id)
      .single();
      
    setCurrentUser({
      ...session.user,
      public_key: currentUserProfile?.public_key || null,
    });

    // Check if it's the AI bot
    if (resolvedParams.contactId === '00000000-0000-0000-0000-000000000000') {
      setContactInfo({
        name: "Groq AI",
        friend_code: "GROQAI",
        avatar_url: "https://ui-avatars.com/api/?name=AI&background=0D8ABC&color=fff&rounded=true&bold=true",
        public_key: null
      });
      return;
    }

    // Check if it's a group
    const { data: groupData } = await supabase
      .from("groups")
      .select("id, name, avatar_url")
      .eq("id", resolvedParams.contactId)
      .single();

    if (groupData) {
      setIsGroup(true);
      setContactInfo({
        name: groupData.name,
        friend_code: "Group",
        avatar_url: groupData.avatar_url,
        public_key: null // Groups don't have a single public key, they have a symmetric group key
      });
      return;
    }

    // Otherwise, it's a direct contact
    const { data: contactData } = await supabase
      .from("contacts")
      .select("name")
      .eq("user_id", session.user.id)
      .eq("contact_user_id", resolvedParams.contactId)
      .single();

    const { data: profileData } = await supabase
      .from("profiles")
      .select("friend_code, avatar_url, public_key")
      .eq("id", resolvedParams.contactId)
      .single();

    setContactInfo({
      name: contactData?.name || null,
      friend_code: profileData?.friend_code || "Unknown",
      avatar_url: profileData?.avatar_url || null,
      public_key: profileData?.public_key || null,
    });
  };

  useEffect(() => {
    fetchContact();
  }, [resolvedParams.contactId, router]);

  const handleDeleteContact = async () => {
    if (!confirm("Are you sure you want to permanently delete this contact? Their message history will remain, but they will be removed from your list.")) return;
    setIsProcessing(true);
    await supabase.from("contacts").delete().eq("user_id", currentUser.id).eq("contact_user_id", resolvedParams.contactId);
    router.push("/dashboard");
  };

  const handleBlockContact = async () => {
    if (!confirm("Are you sure you want to block this user? You will no longer receive their messages or calls.")) return;
    setIsProcessing(true);
    const blockedUsers = currentUser.user_metadata?.blocked_users || [];
    if (!blockedUsers.includes(resolvedParams.contactId)) {
      await supabase.auth.updateUser({
        data: { blocked_users: [...blockedUsers, resolvedParams.contactId] }
      });
    }
    router.push("/dashboard");
  };

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
            <div className="flex items-center gap-1.5">
              <h2 className="font-medium text-foreground leading-tight">
                {contactInfo.name || `User ${contactInfo.friend_code}`}
              </h2>
              {!isGroup && (
                <button
                  onClick={() => setIsRenameModalOpen(true)}
                  className="opacity-50 hover:opacity-100 p-1 rounded hover:bg-input transition-all"
                  title="Rename contact"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {isGroup ? "Group Chat" : `#${contactInfo.friend_code}`}
            </p>
          </div>
        </div>
        
        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {!isGroup && (
            <>
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
            </>
          )}
          
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              title="More Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#1a1a1a] border border-border rounded-xl shadow-xl overflow-hidden z-50">
                {isGroup ? (
                  <button
                    onClick={() => { setIsMenuOpen(false); setIsGroupSettingsOpen(true); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
                  >
                    Group Settings
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleBlockContact}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      Block User
                    </button>
                    <div className="h-px bg-border w-full" />
                    <button
                      onClick={handleDeleteContact}
                      disabled={isProcessing}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors text-left disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      Delete Contact
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      
      <div className="flex-1 min-h-0">
        <ChatInterface 
          currentUserId={currentUser.id} 
          contactId={resolvedParams.contactId} 
          blockedUsers={currentUser.user_metadata?.blocked_users || []}
          isGroup={isGroup}
        />
      </div>
      
      <CallManager 
        ref={callManagerRef}
        currentUserId={currentUser.id} 
        contactId={resolvedParams.contactId}
        contactName={contactInfo.name || `User ${contactInfo.friend_code}`}
        contactAvatar={contactInfo.avatar_url}
      />

      <RenameContactModal
        isOpen={isRenameModalOpen}
        onClose={() => setIsRenameModalOpen(false)}
        onContactRenamed={fetchContact}
        contactId={resolvedParams.contactId}
        currentName={contactInfo.name || ""}
      />

      <GroupSettingsModal
        isOpen={isGroupSettingsOpen}
        onClose={() => setIsGroupSettingsOpen(false)}
        groupId={resolvedParams.contactId}
        currentUserId={currentUser.id}
        onGroupLeft={() => router.push("/dashboard")}
      />
    </div>
  );
}
