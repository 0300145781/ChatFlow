import { useState, useEffect } from "react";

export type ChatWallpaper = string;

export interface AppSettings {
  wallpaper: ChatWallpaper;
  sendOnEnter: boolean;
  customWallpaperUrl: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  wallpaper: "default",
  sendOnEnter: true,
  customWallpaperUrl: null,
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    const loadSettings = () => {
      const saved = localStorage.getItem("app_settings");
      if (saved) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
        } catch (e) {
          console.error("Failed to parse settings", e);
        }
      }
    };

    // Load initially
    loadSettings();

    // Listen for custom event across the same window
    window.addEventListener("app_settings_changed", loadSettings);
    
    return () => {
      window.removeEventListener("app_settings_changed", loadSettings);
    };
  }, []);

  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      localStorage.setItem("app_settings", JSON.stringify(newSettings));
      
      setTimeout(() => {
        window.dispatchEvent(new Event("app_settings_changed"));
      }, 0);
      
      return newSettings;
    });
  };

  return {
    settings,
    updateSettings,
    mounted,
  };
}
