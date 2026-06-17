"use client";

import { useState, useRef, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Upload, User, Sun, Moon, Image as ImageIcon, MessageSquare, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useSettings, ChatWallpaper } from "../hooks/useSettings";

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated: () => void;
  profile: any;
}

const WALLPAPER_OPTIONS: { id: ChatWallpaper; label: string; class?: string; image?: string }[] = [
  { id: "default", label: "Default", class: "bg-background border-border" },
  { id: "gradient-1", label: "Aurora", class: "bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20" },
  { id: "gradient-2", label: "Ocean", class: "bg-gradient-to-br from-cyan-500/20 to-blue-500/20" },
  { id: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&q=80", label: "Love", image: "https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1529156069898-49953eb1b55e?auto=format&fit=crop&q=80", label: "Friends", image: "https://images.unsplash.com/photo-1529156069898-49953eb1b55e?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&q=80", label: "Night Sky", image: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&q=80", label: "Earth", image: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1522030299830-16b8d3d049fe?auto=format&fit=crop&q=80", label: "Moon", image: "https://images.unsplash.com/photo-1522030299830-16b8d3d049fe?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80", label: "Nature", image: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&q=80" },
  { id: "https://images.unsplash.com/photo-1437482078695-73f5ca6c96e2?auto=format&fit=crop&q=80", label: "River", image: "https://images.unsplash.com/photo-1437482078695-73f5ca6c96e2?auto=format&fit=crop&q=80" },
];

export default function UserSettingsModal({ isOpen, onClose, onProfileUpdated, profile }: UserSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "app">("profile");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Profile Form State
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customWallpaperRef = useRef<HTMLInputElement>(null);
  
  const { theme, setTheme } = useTheme();
  const { settings, updateSettings, mounted } = useSettings();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.name || "");
      setBio(profile.bio || "");
    }
  }, [profile]);

  if (!isOpen || !profile) return null;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleCustomWallpaper = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      updateSettings({ customWallpaperUrl: result, wallpaper: "default" }); // Set default to force custom image
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ name: displayName, bio })
        .eq("id", profile.id);

      if (updateError) throw updateError;
      onProfileUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-black/5 dark:bg-white/5">
          <h2 className="text-lg font-medium text-foreground">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button 
            onClick={() => setActiveTab("profile")}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "profile" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Profile
          </button>
          <button 
            onClick={() => setActiveTab("app")}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === "app" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            App
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-200 dark:border-red-800 w-full mb-4">
              {error}
            </div>
          )}

          {activeTab === "profile" && (
            <div className="flex flex-col gap-6">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
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
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 ml-1 uppercase tracking-wider">Display Name</label>
                  <input 
                    type="text" 
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1 ml-1 uppercase tracking-wider">Bio / Status</label>
                  <input 
                    type="text" 
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="E.g., At the gym, Working..."
                    className="w-full bg-black/5 dark:bg-white/5 border border-border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                  />
                </div>
              </div>

              <button 
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full bg-primary text-primary-foreground font-medium py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 mt-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Profile"}
              </button>
            </div>
          )}

          {activeTab === "app" && mounted && (
            <div className="flex flex-col gap-8">
              {/* Theme & Behavior */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Appearance & Behavior</h3>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                      {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </div>
                    <span>Dark Mode</span>
                  </div>
                  <button
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      theme === "dark" ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`${theme === "dark" ? "translate-x-6" : "translate-x-1"} inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white transition-transform shadow-sm`} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span>Send on Enter</span>
                  </div>
                  <button
                    onClick={() => updateSettings({ sendOnEnter: !settings.sendOnEnter })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.sendOnEnter ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span className={`${settings.sendOnEnter ? "translate-x-6" : "translate-x-1"} inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white transition-transform shadow-sm`} />
                  </button>
                </div>
              </div>

              {/* Wallpaper */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-sm font-semibold text-foreground">Chat Wallpaper</h3>
                  {settings.customWallpaperUrl && (
                    <button 
                      onClick={() => updateSettings({ customWallpaperUrl: null })}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Clear custom
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {WALLPAPER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => updateSettings({ wallpaper: opt.id, customWallpaperUrl: null })}
                      className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all flex items-center justify-center group ${opt.class || ""} ${settings.wallpaper === opt.id && !settings.customWallpaperUrl ? "border-primary scale-105 shadow-md" : "border-border hover:border-primary/50"}`}
                      style={opt.image ? { backgroundImage: `url(${opt.image})`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                    >
                      {settings.wallpaper === opt.id && !settings.customWallpaperUrl && (
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center z-10">
                          <Check className="w-5 h-5 text-white drop-shadow-md" />
                        </div>
                      )}
                      <span className="text-[10px] font-medium px-2 py-1 bg-background/50 backdrop-blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {opt.label}
                      </span>
                    </button>
                  ))}

                  {/* Custom Upload */}
                  <button
                    onClick={() => customWallpaperRef.current?.click()}
                    className={`relative aspect-video rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 ${settings.customWallpaperUrl ? "border-primary" : "border-border hover:border-primary hover:bg-primary/5"}`}
                  >
                    {settings.customWallpaperUrl ? (
                      <>
                        <img src={settings.customWallpaperUrl} className="absolute inset-0 w-full h-full object-cover opacity-50" />
                        <Check className="w-5 h-5 text-primary z-10" />
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground">Upload</span>
                      </>
                    )}
                  </button>
                  <input
                    type="file"
                    ref={customWallpaperRef}
                    onChange={handleCustomWallpaper}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
