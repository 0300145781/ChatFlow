"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Loader2, X, Users, Settings, UserMinus, UserPlus, LogOut } from "lucide-react";
import { exportGroupKey, encryptGroupKeyForUser, getPrivateKey, deriveSharedSecret, importPublicKey } from "../../lib/crypto";

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  onGroupLeft: () => void;
}

export default function GroupSettingsModal({ isOpen, onClose, groupId, currentUserId, onGroupLeft }: GroupSettingsModalProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const fetchGroupData = async () => {
    setLoading(true);
    const { data: gData } = await supabase.from("groups").select("*").eq("id", groupId).single();
    if (gData) setGroup(gData);

    const { data: mData } = await supabase
      .from("group_members")
      .select("role, joined_at, profiles(id, name, friend_code, avatar_url)")
      .eq("group_id", groupId);
      
    if (mData) {
      setMembers(mData.map(m => ({
        ...m.profiles,
        role: m.role,
        joined_at: m.joined_at
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchGroupData();
    }
  }, [isOpen, groupId]);

  const handleLeaveGroup = async () => {
    if (!confirm("Are you sure you want to leave this group?")) return;
    setProcessing(true);
    await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", currentUserId);
    setProcessing(false);
    onGroupLeft();
    onClose();
  };

  const myRole = members.find(m => m.id === currentUserId)?.role;
  const isAdmin = myRole === "admin";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111111] border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            Group Settings
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/10 text-red-500 text-sm rounded-xl border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden border border-border">
                  {group?.avatar_url ? (
                    <img src={group.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-10 h-10 text-foreground/70" />
                  )}
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-semibold">{group?.name}</h3>
                  <p className="text-sm text-muted-foreground">{members.length} members</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Members</h4>
                </div>
                
                <div className="space-y-2">
                  {members.map(member => (
                    <div key={member.id} className="flex items-center justify-between p-3 rounded-xl border border-border bg-black/5 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-primary font-medium text-sm">
                              {(member.name || member.friend_code).charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {member.id === currentUserId ? "You" : member.name || `User ${member.friend_code}`}
                            {member.role === "admin" && <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Admin</span>}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            #{member.friend_code}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border bg-black/5 dark:bg-white/5 flex flex-col gap-2 shrink-0">
          <button
            onClick={handleLeaveGroup}
            disabled={processing}
            className="w-full px-4 py-3 rounded-xl font-medium bg-red-50 dark:bg-red-950/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            Leave Group
          </button>
        </div>
      </div>
    </div>
  );
}
