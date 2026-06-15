"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Copy, Check, Plus, User, LogOut, Pencil, MessageSquare, Phone, PhoneMissed, PhoneOutgoing, PhoneIncoming } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AddContactModal from "./AddContactModal";
import RenameContactModal from "./RenameContactModal";
import UserSettingsModal from "./UserSettingsModal";

export default function Sidebar() {
  const [view, setView] = useState<"chats" | "calls">("chats");
  const [profile, setProfile] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<{ id: string; name: string } | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push("/");
      return;
    }

    // Fetch user profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
    }

    // Fetch contacts
    const { data: contactsData, error: contactsError } = await supabase
      .from("contacts")
      .select("id, contact_user_id, name")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    // Fetch calls
    const { data: callsData, error: callsError } = await supabase
      .from("calls")
      .select("id, caller_id, receiver_id, status, duration_seconds, created_at")
      .or(`caller_id.eq.${session.user.id},receiver_id.eq.${session.user.id}`)
      .order("created_at", { ascending: false });

    const userIdsToFetch = new Set<string>();
    if (contactsData) {
      contactsData.forEach(c => userIdsToFetch.add(c.contact_user_id));
    }
    if (callsData) {
      callsData.forEach(c => {
        if (c.caller_id !== session.user.id) userIdsToFetch.add(c.caller_id);
        if (c.receiver_id !== session.user.id) userIdsToFetch.add(c.receiver_id);
      });
    }

    let profilesData: any[] = [];
    if (userIdsToFetch.size > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, friend_code, avatar_url")
        .in("id", Array.from(userIdsToFetch));
      if (data) profilesData = data;
    }

    if (contactsData) {
      setContacts(
        contactsData.map((c) => {
          const p = profilesData.find((p) => p.id === c.contact_user_id);
          return {
            id: c.id,
            contact_id: c.contact_user_id,
            name: c.name,
            friend_code: p?.friend_code || "Unknown",
            avatar_url: p?.avatar_url || null,
          };
        })
      );
    }

    if (callsData) {
      setCalls(
        callsData.map((c) => {
          const otherId = c.caller_id === session.user.id ? c.receiver_id : c.caller_id;
          const p = profilesData.find((profile) => profile.id === otherId);
          const contact = contactsData?.find((cont) => cont.contact_user_id === otherId);
          return {
            id: c.id,
            contact_id: otherId,
            name: contact?.name || null,
            friend_code: p?.friend_code || "Unknown",
            avatar_url: p?.avatar_url || null,
            is_caller: c.caller_id === session.user.id,
            status: c.status,
            duration_seconds: c.duration_seconds,
            created_at: c.created_at,
          };
        })
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  useEffect(() => {
    if (!profile?.id) return;
    
    const topic = "online-users";

    supabase.getChannels().forEach((c) => {
      if (c.topic === `realtime:${topic}`) {
        supabase.removeChannel(c);
      }
    });

    const channel = supabase.channel(topic, {
      config: {
        presence: { key: profile.id }
      }
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const onlineIds = new Set(Object.keys(state));
        setOnlineUserIds(onlineIds);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const copyCode = () => {
    if (profile?.friend_code) {
      navigator.clipboard.writeText(profile.friend_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const formatTime = (dateString: string) => {
    const d = new Date(dateString);
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="w-80 border-r border-border bg-[#fcfcfc] dark:bg-[#151515] p-6 flex flex-col items-center justify-center h-full">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="w-full md:w-80 border-r border-border bg-[#fcfcfc] dark:bg-[#151515] flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="font-semibold text-foreground flex items-center gap-2 hover:opacity-80 transition-opacity"
              title="Open Settings"
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
              My Profile
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="bg-white dark:bg-[#202020] border border-border rounded-lg p-3 shadow-sm">
            <p className="text-xs text-muted-foreground mb-1.5">Friend Code</p>
            <div className="flex items-center gap-2">
              <code className="bg-input px-2 py-1 rounded font-mono text-sm flex-1 text-foreground border border-border">
                {profile?.friend_code || "------"}
              </code>
              <button
                onClick={copyCode}
                className="p-1.5 rounded-md hover:bg-input text-muted-foreground hover:text-foreground transition-colors border border-transparent hover:border-border"
                title="Copy friend code"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Tabs */}
        <div className="p-4 pb-2">
          <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl">
            <button 
              onClick={() => setView("chats")}
              className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                view === "chats" 
                  ? "bg-white dark:bg-[#2a2a2a] text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Chats
            </button>
            <button 
              onClick={() => setView("calls")}
              className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                view === "calls" 
                  ? "bg-white dark:bg-[#2a2a2a] text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Phone className="w-4 h-4" />
              Calls
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {view === "chats" && (
            <>
              <div className="flex items-center justify-between mb-4 mt-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contacts</h3>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="p-1 rounded-full hover:bg-input text-muted-foreground hover:text-foreground transition-colors"
                  title="Add Contact"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1.5">
                {contacts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No contacts yet. <br/>Add someone by their code!
                  </p>
                ) : (
                  contacts.map((contact) => (
                    <Link
                      href={`/dashboard/${contact.contact_id}`}
                      key={contact.id}
                      className="group relative w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-[#202020] hover:shadow-sm border border-transparent hover:border-border transition-all text-left"
                    >
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
                          {contact.avatar_url ? (
                            <img src={contact.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-foreground/70" />
                          )}
                        </div>
                        {onlineUserIds.has(contact.contact_id) && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-[#202020] group-hover:border-[#f9fafb] dark:group-hover:border-[#2a2a2a] transition-colors" />
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-medium text-foreground truncate">
                          {contact.name || `User ${contact.friend_code}`}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingContact({
                            id: contact.id,
                            name: contact.name || `User ${contact.friend_code}`
                          });
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-input text-muted-foreground hover:text-foreground transition-all shrink-0"
                        title="Rename contact"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}

          {view === "calls" && (
            <>
              <div className="flex items-center justify-between mb-4 mt-2">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent</h3>
              </div>
              <div className="space-y-1.5">
                {calls.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No recent calls.
                  </p>
                ) : (
                  calls.map((call) => (
                    <Link
                      href={`/dashboard/${call.contact_id}`}
                      key={call.id}
                      className="group relative w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-[#202020] hover:shadow-sm border border-transparent hover:border-border transition-all text-left"
                    >
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
                          {call.avatar_url ? (
                            <img src={call.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-foreground/70" />
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${call.status === "missed" && !call.is_caller ? "text-red-500" : "text-foreground"}`}>
                          {call.name || `User ${call.friend_code}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                          {call.is_caller ? (
                            <PhoneOutgoing className={`w-3 h-3 ${call.status === "missed" ? "text-red-500" : "text-green-500"}`} />
                          ) : (
                            call.status === "missed" ? (
                              <PhoneMissed className="w-3 h-3 text-red-500" />
                            ) : (
                              <PhoneIncoming className="w-3 h-3 text-green-500" />
                            )
                          )}
                          <span className="truncate">
                            {call.status === "completed" ? formatDuration(call.duration_seconds) : "Missed"}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatTime(call.created_at)}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <AddContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onContactAdded={fetchData}
        currentUserId={profile?.id}
      />

      <RenameContactModal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        onContactRenamed={fetchData}
        contactId={editingContact?.id || null}
        currentName={editingContact?.name || ""}
      />

      <UserSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onProfileUpdated={fetchData}
        profile={profile}
      />
    </>
  );
}
