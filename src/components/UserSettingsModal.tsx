"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Upload, User, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated: () => void;
  profile: any;
}

export default function UserSettingsModal({ isOpen, onClose, onProfileUpdated, profile }: UserSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !profile) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${profile.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      onProfileUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to upload avatar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="notion-card w-full max-w-sm p-6 bg-white dark:bg-[#202020] animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium text-foreground">User Settings</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center overflow-hidden border-2 border-border group-hover:border-primary transition-colors">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <User className="w-10 h-10 text-foreground/50" />
              )}
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {loading ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Upload className="w-6 h-6 text-white" />}
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">Click to upload avatar</p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full text-center mt-2">
              {error}
            </div>
          )}

          {mounted && (
            <div className="w-full pt-4 border-t border-border mt-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-medium text-foreground">Dark Mode</span>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none ${
                    theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`${
                      theme === "dark" ? "translate-x-6" : "translate-x-1"
                    } inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white transition-transform shadow-sm`}
                  >
                    {theme === "dark" ? (
                      <Moon className="h-3 w-3 text-black" />
                    ) : (
                      <Sun className="h-3 w-3 text-black" />
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
