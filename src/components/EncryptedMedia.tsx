import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { decryptFile } from "../../lib/crypto";
import { Message } from "../types";

const EncryptedMedia = ({ message, e2eKeysRef, currentUserId }: { message: Message, e2eKeysRef: any, currentUserId: string }) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    const fetchAndDecrypt = async () => {
      try {
        const { data, error: downloadError } = await supabase.storage.from("voice_notes").download(message.content);
        if (downloadError || !data) throw downloadError || new Error("No data");
        
        const encryptedBuffer = await data.arrayBuffer();
        const iv = new Uint8Array(encryptedBuffer.slice(0, 12));
        const encryptedData = encryptedBuffer.slice(12);
        
        // Handle group chats vs direct chats
        const secret = message.group_id 
            ? e2eKeysRef.current.groupSharedSecret 
            : (message.sender_id === currentUserId ? e2eKeysRef.current.mySharedSecret : e2eKeysRef.current.receiverSharedSecret);
            
        if (!secret) throw new Error("Missing shared secret");
        
        const decryptedBuffer = await decryptFile(encryptedData, secret, iv);
        const blob = new Blob([decryptedBuffer]);
        objectUrl = URL.createObjectURL(blob);
        setMediaUrl(objectUrl);
      } catch (err: any) {
        setError(err.message || "Failed to load media");
      } finally {
        setLoadingMedia(false);
      }
    };
    fetchAndDecrypt();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.content, message.sender_id, message.group_id, currentUserId, e2eKeysRef]);

  if (loadingMedia) return <div className="w-48 h-32 bg-black/10 dark:bg-white/10 rounded-xl animate-pulse flex items-center justify-center text-xs text-muted-foreground">Decrypting...</div>;
  if (error) return <div className="w-48 h-32 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-xl flex items-center justify-center text-xs italic p-4 text-center">Failed to load media</div>;
  if (!mediaUrl) return null;

  return <img src={mediaUrl} className="max-w-[240px] md:max-w-xs max-h-64 object-cover rounded-xl cursor-pointer shadow-sm hover:opacity-95 transition-opacity" alt="Encrypted Media" onClick={() => window.open(mediaUrl, '_blank')} />;
};

export default EncryptedMedia;
