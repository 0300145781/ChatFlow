"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { X, Loader2 } from "lucide-react";

interface AddContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactAdded: () => void;
  currentUserId: string;
}

export default function AddContactModal({ isOpen, onClose, onContactAdded, currentUserId }: AddContactModalProps) {
  const [code, setCode] = useState("");
  const [contactName, setContactName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (code.length !== 6) {
        throw new Error("Friend code must be 6 characters.");
      }

      // 1. Find user by friend_code
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("friend_code", code.toUpperCase())
        .single();

      if (profileError || !profile) {
        throw new Error("User with this friend code not found.");
      }

      if (profile.id === currentUserId) {
        throw new Error("You cannot add yourself.");
      }

      // 2. Insert into contacts
      const { error: insertError } = await supabase
        .from("contacts")
        .insert([
          { user_id: currentUserId, contact_user_id: profile.id, name: contactName.trim() || null }
        ]);

      if (insertError) {
        if (insertError.code === "23505") { // Unique violation
          throw new Error("This user is already in your contacts.");
        }
        throw insertError;
      }

      onContactAdded();
      setCode("");
      setContactName("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add contact.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="notion-card w-full max-w-sm p-6 bg-white dark:bg-[#202020] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-foreground">Add Contact</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Friend Code</label>
            <input
              type="text"
              required
              maxLength={6}
              className="notion-input w-full uppercase text-center font-mono tracking-widest text-lg"
              placeholder="XXXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Contact Name (Optional)</label>
            <input
              type="text"
              className="notion-input w-full"
              placeholder="e.g. Alice"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="notion-button flex justify-center items-center min-w-[100px] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Friend"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
