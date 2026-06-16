"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import { motion, AnimatePresence } from "framer-motion";
import PushRegistration from "./PushRegistration";

export default function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChatView = pathname !== "/dashboard";

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative">
      <PushRegistration />
      {/* Desktop View: Side by Side */}
      <div className="hidden md:flex w-full h-full">
        <Sidebar />
        <main className="flex-1 min-w-0 h-full relative z-10 bg-background">{children}</main>
      </div>

      {/* Mobile View: Stacked with Animation */}
      <div className="md:hidden w-full h-full relative overflow-hidden bg-background">
        <AnimatePresence initial={false}>
          {!isChatView && (
            <motion.div
              key="sidebar"
              initial={{ x: "-30%" }}
              animate={{ x: 0 }}
              exit={{ x: "-30%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-10 bg-background"
            >
              <Sidebar />
            </motion.div>
          )}

          {isChatView && (
            <motion.div
              key="chat"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-20 bg-background shadow-2xl"
            >
              <main className="h-full w-full bg-background">{children}</main>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
