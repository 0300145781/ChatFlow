"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Copy, Check, Plus, User, LogOut, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AddContactModal from "./AddContactModal";
import RenameContactModal from "./RenameContactModal";
import UserSettingsModal from "./UserSettingsModal";

export default function Sidebar() {
  const [profile, setProfile] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
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

    if (contactsError) {
      console.error("Error fetching contacts:", contactsError);
    }

    if (contactsData && contactsData.length > 0) {
      const contactUserIds = contactsData.map((c) => c.contact_user_id);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, friend_code, avatar_url")
        .in("id", contactUserIds);

      if (profilesError) {
        setContacts(
          contactsData.map((c) => ({
            id: c.id,
            contact_id: c.contact_user_id,
            name: c.name,
            friend_code: "Unknown",
            avatar_url: null,
          }))
        );
      } else if (profilesData) {
        setContacts(
          contactsData.map((c) => {
            const profile = profilesData.find((p) => p.id === c.contact_user_id);
            return {
              id: c.id,
              contact_id: c.contact_user_id,
              name: c.name,
              friend_code: profile?.friend_code || "Unknown",
              avatar_url: profile?.avatar_url || null,
            };
          })
        );
      }
    } else {
      setContacts([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [router]);

  useEffect(() => {
    if (!profile?.id) return;
    
    const channel = supabase.channel("online-users", {
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

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Contacts</h3>
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
