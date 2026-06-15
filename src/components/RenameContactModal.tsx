"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { X, Loader2 } from "lucide-react";

interface RenameContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContactRenamed: () => void;
  contactId: string | null;
  currentName: string;
}

export default function RenameContactModal({ isOpen, onClose, onContactRenamed, contactId, currentName }: RenameContactModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
    }
  }, [isOpen, currentName]);

  if (!isOpen || !contactId) return null;

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from("contacts")
        .update({ name: name.trim() || null })
        .eq("id", contactId);

      if (updateError) {
        throw updateError;
      }

      onContactRenamed();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to rename contact.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="notion-card w-full max-w-sm p-6 bg-white dark:bg-[#202020] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-foreground">Rename Contact</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleRename} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">Contact Name</label>
            <input
              type="text"
              className="notion-input w-full"
              placeholder="e.g. Alice"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
              disabled={loading}
              className="notion-button flex justify-center items-center min-w-[80px] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
