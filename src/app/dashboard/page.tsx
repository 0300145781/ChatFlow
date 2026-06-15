import { MessageSquarePlus } from "lucide-react";

export default function DashboardEmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full">
      <div className="w-16 h-16 bg-input rounded-2xl flex items-center justify-center mb-6 border border-border shadow-sm">
        <MessageSquarePlus className="w-8 h-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-medium text-foreground mb-2">Your Messages</h2>
      <p className="text-muted-foreground text-sm max-w-sm">
        Select a contact from the sidebar to start a conversation, or add a new friend using their friend code.
      </p>
    </div>
  );
}
