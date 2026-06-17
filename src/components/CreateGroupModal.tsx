"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Loader2, X, Users, Search, Check } from "lucide-react";
import { generateGroupKey, exportGroupKey, encryptGroupKeyForUser, getPrivateKey, deriveSharedSecret, importPublicKey } from "../../lib/crypto";

interface Contact {
  id: string;
  contact_id: string;
  name: string | null;
  friend_code: string;
  avatar_url: string | null;
  public_key?: string | null;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated: () => void;
  currentUserId: string;
  contacts: Contact[];
}

export default function CreateGroupModal({ isOpen, onClose, onGroupCreated, currentUserId, contacts }: CreateGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contactsWithKeys, setContactsWithKeys] = useState<Contact[]>([]);

  useEffect(() => {
    if (isOpen) {
      setGroupName("");
      setSearchQuery("");
      setSelectedContactIds(new Set());
      setError("");
      
      // Fetch public keys for contacts
      const fetchKeys = async () => {
        const { data } = await supabase
          .from("profiles")
          .select("id, public_key")
          .in("id", contacts.map(c => c.contact_id));
        
        if (data) {
          setContactsWithKeys(contacts.map(c => {
            const p = data.find(d => d.id === c.contact_id);
            return { ...c, public_key: p?.public_key };
          }));
        } else {
          setContactsWithKeys(contacts);
        }
      };
      fetchKeys();
    }
  }, [isOpen, contacts]);

  if (!isOpen) return null;

  const filteredContacts = contactsWithKeys.filter(c => 
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.friend_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleContact = (contactId: string) => {
    const newSet = new Set(selectedContactIds);
    if (newSet.has(contactId)) newSet.delete(contactId);
    else newSet.add(contactId);
    setSelectedContactIds(newSet);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError("Please enter a group name");
      return;
    }
    if (selectedContactIds.size === 0) {
      setError("Please select at least one friend to add to the group");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Create the Group in the DB
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .insert([{ name: groupName.trim(), created_by: currentUserId }])
        .select()
        .single();

      if (groupError) throw new Error("Failed to create group. Did you run the SQL script? (" + groupError.message + ")");
      const groupId = groupData.id;

      // 2. Add members
      const membersToInsert = [
        { group_id: groupId, user_id: currentUserId, role: "admin" },
        ...Array.from(selectedContactIds).map(id => ({ group_id: groupId, user_id: id, role: "member" }))
      ];

      const { error: membersError } = await supabase.from("group_members").insert(membersToInsert);
      if (membersError) throw membersError;

      // 3. E2EE: Generate Group Key
      const groupKey = await generateGroupKey();
      const exportedKey = await exportGroupKey(groupKey);
      
      const myPrivKey = await getPrivateKey(currentUserId);
      if (!myPrivKey) throw new Error("Your private key is missing. Please log in again.");

      // Fetch my public key for encrypting my own copy of the group key
      const { data: myProfile } = await supabase.from("profiles").select("public_key").eq("id", currentUserId).single();
      if (!myProfile?.public_key) throw new Error("Your public key is missing.");

      // Combine me and the selected contacts to distribute keys
      const membersToDistributeKeysTo = [
        { id: currentUserId, public_key: myProfile.public_key },
        ...Array.from(selectedContactIds).map(id => {
          const c = contactsWithKeys.find(contact => contact.contact_id === id);
          return { id, public_key: c?.public_key };
        })
      ];

      const groupKeysToInsert = [];

      for (const member of membersToDistributeKeysTo) {
        if (!member.public_key) {
          console.warn(`User ${member.id} is missing a public key. They will not be able to decrypt the group chat.`);
          continue;
        }

        const memberPub = await importPublicKey(member.public_key);
        const sharedSecret = await deriveSharedSecret(myPrivKey, memberPub);
        
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encryptedKeyBase64 = await encryptGroupKeyForUser(exportedKey, sharedSecret, iv);
        
        groupKeysToInsert.push({
          group_id: groupId,
          user_id: member.id,
          encrypted_key: JSON.stringify({ 
            iv: Array.from(iv), 
            key: encryptedKeyBase64,
            encrypted_by: currentUserId
          })
        });
      }

      const { error: keysError } = await supabase.from("group_keys").insert(groupKeysToInsert);
      if (keysError) throw keysError;

      onGroupCreated();
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#111111] border border-border w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Create Group
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreateGroup} className="flex flex-col min-h-0 overflow-hidden">
          <div className="p-6 overflow-y-auto space-y-5">
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/10 text-red-500 text-sm rounded-xl border border-red-100 dark:border-red-900/30">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Group Name</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Weekend Getaway"
                className="w-full bg-input border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                autoFocus
                maxLength={50}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Add Members</label>
              <div className="relative mb-3">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search friends..."
                  className="w-full bg-input border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>

              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                {filteredContacts.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm py-4">
                    No friends found
                  </div>
                ) : (
                  filteredContacts.map(contact => {
                    const isSelected = selectedContactIds.has(contact.contact_id);
                    return (
                      <div 
                        key={contact.contact_id}
                        onClick={() => toggleContact(contact.contact_id)}
                        className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${
                          isSelected 
                            ? "bg-primary/10 border border-primary/20" 
                            : "bg-transparent hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center shrink-0 overflow-hidden relative">
                          {contact.avatar_url ? (
                            <img src={contact.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-primary font-medium text-sm">
                              {(contact.name || contact.friend_code).charAt(0).toUpperCase()}
                            </span>
                          )}
                          {isSelected && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center backdrop-blur-[1px]">
                              <Check className="w-5 h-5 text-primary drop-shadow-md" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {contact.name || `User ${contact.friend_code}`}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            #{contact.friend_code}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"
                        }`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-border bg-black/5 dark:bg-white/5 flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !groupName.trim() || selectedContactIds.size === 0}
              className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                `Create Group (${selectedContactIds.size})`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
