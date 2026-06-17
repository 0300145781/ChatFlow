export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  type: string;
  created_at: string;
  is_deleted?: boolean;
  deleted_for_users?: string[];
  reactions?: { user_id: string; emoji: string }[];
  read_at?: string | null;
  reply_to_id?: string | null;
  reply_to?: Message | null;
  decryptionFailed?: boolean;
  group_id?: string | null;
  is_ai?: boolean;
}
