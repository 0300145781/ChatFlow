"use client";

import { useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { supabase } from "../../lib/supabase";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export type CallType = "audio" | "video";

export interface CallManagerRef {
  startCall: (type: CallType) => void;
}

interface CallManagerProps {
  currentUserId: string;
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
}

type CallState = "idle" | "calling" | "receiving" | "active";

const CallManager = forwardRef<CallManagerRef, CallManagerProps>(({
  currentUserId, contactId, contactName, contactAvatar
}, ref) => {
  const [callState, setCallState] = useState<CallState>("idle");
  const [callType, setCallType] = useState<CallType | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  
  const [remoteIsMuted, setRemoteIsMuted] = useState(false);
  const [remoteIsVideoOff, setRemoteIsVideoOff] = useState(false);
  
  const [callDurationStr, setCallDurationStr] = useState("00:00");
  
  const callMetaRef = useRef({
    isCaller: false,
    startTime: null as number | null
  });
  
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioOnlyRef = useRef<HTMLAudioElement | null>(null);
  
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);
  const outgoingAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const pendingCandidatesRef = useRef<any[]>([]);

  useImperativeHandle(ref, () => ({
    startCall: (type) => initiateCall(type)
  }));

  const setupWebRTC = async () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    remoteStreamRef.current = new MediaStream();
    
    // Attach to appropriate media element based on callType
    if (callType === "video" && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    } else if (callType === "audio" && audioOnlyRef.current) {
      audioOnlyRef.current.srcObject = remoteStreamRef.current;
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice_candidate",
          payload: { candidate: event.candidate, from: currentUserId, to: contactId }
        });
      }
    };

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        if (remoteStreamRef.current && !remoteStreamRef.current.getTrackById(track.id)) {
          remoteStreamRef.current.addTrack(track);
        }
      });
      // Ensure elements are synced
      if (callType === "video" && remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      if (callType === "audio" && audioOnlyRef.current && audioOnlyRef.current.srcObject !== remoteStreamRef.current) {
        audioOnlyRef.current.srcObject = remoteStreamRef.current;
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const getMediaStream = async (type: CallType) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: type === "video" 
      });
      
      setMediaError(null);
      localStreamRef.current = stream;
      if (type === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err: any) {
      console.error("Failed to get local media", err);
      // Fallback to audio if video fails
      if (type === "video") {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = audioStream;
          setIsVideoOff(true);
          if (localVideoRef.current) localVideoRef.current.srcObject = audioStream;
          setMediaError("Camera not found. Falling back to audio-only.");
          setTimeout(() => setMediaError(null), 5000);
          return audioStream;
        } catch (audioErr: any) {
          console.error("Failed to get audio stream", audioErr);
          setMediaError(audioErr.name === "NotFoundError" ? "No microphone found. Please connect a mic." : "Camera/Microphone permission denied.");
          setTimeout(() => setMediaError(null), 5000);
        }
      } else {
        setMediaError(err.name === "NotFoundError" ? "No microphone found. Please connect a mic." : "Microphone permission denied.");
        setTimeout(() => setMediaError(null), 5000);
      }
      return null;
    }
  };

  const cleanup = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(t => t.stop());
      remoteStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setCallState("idle");
    setCallType(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setRemoteIsMuted(false);
    setRemoteIsVideoOff(false);
    setCallDurationStr("00:00");
    pendingCandidatesRef.current = [];
  };

  const recordCall = (status: "completed" | "missed" | "rejected") => {
    if (!callMetaRef.current.isCaller) return;
    
    let duration = 0;
    if (callMetaRef.current.startTime) {
      duration = Math.floor((Date.now() - callMetaRef.current.startTime) / 1000);
    }
    
    supabase.from("calls").insert([
      {
        caller_id: currentUserId,
        receiver_id: contactId,
        status,
        duration_seconds: duration
      }
    ]).then(({ error }) => {
      if (error) console.error("Error recording call history:", error);
    });
    
    callMetaRef.current.isCaller = false;
    callMetaRef.current.startTime = null;
  };

  useEffect(() => {
    if (callState === "active") {
      const interval = setInterval(() => {
        if (!callMetaRef.current.startTime) return;
        const diff = Math.floor((Date.now() - callMetaRef.current.startTime) / 1000);
        const m = Math.floor(diff / 60).toString().padStart(2, '0');
        const s = (diff % 60).toString().padStart(2, '0');
        setCallDurationStr(`${m}:${s}`);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [callState]);

  // Handle playing ringtones based on callState
  useEffect(() => {
    if (callState === "calling") {
      if (outgoingAudioRef.current) {
        outgoingAudioRef.current.currentTime = 0;
        outgoingAudioRef.current.play().catch(e => console.error("Could not play outgoing ringtone", e));
      }
    } else {
      if (outgoingAudioRef.current) {
        outgoingAudioRef.current.pause();
        outgoingAudioRef.current.currentTime = 0;
      }
    }

    if (callState === "receiving") {
      if (incomingAudioRef.current) {
        incomingAudioRef.current.currentTime = 0;
        incomingAudioRef.current.play().catch(e => console.error("Could not play incoming ringtone", e));
      }
    } else {
      if (incomingAudioRef.current) {
        incomingAudioRef.current.pause();
        incomingAudioRef.current.currentTime = 0;
      }
    }
  }, [callState]);

  useEffect(() => {
    const roomId = [currentUserId, contactId].sort().join("-");
    const channel = supabase.channel(`webrtc_${roomId}`, {
      config: { broadcast: { ack: true } }
    });

    channel
      .on("broadcast", { event: "call_offer" }, async ({ payload }) => {
        if (payload.to === currentUserId) {
          setCallType(payload.type || "audio");
          setCallState("receiving");
          // Defer PC setup until accepted to guarantee state updates 
          // (Actually, safer to do it on answer to pick up callType state)
          // We will store the offer locally on the window for the accept action.
          (window as any)._pendingOffer = payload.offer;
        }
      })
      .on("broadcast", { event: "call_answer" }, async ({ payload }) => {
        if (payload.to === currentUserId && peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
          callMetaRef.current.startTime = Date.now();
          setCallState("active");
        }
      })
      .on("broadcast", { event: "ice_candidate" }, async ({ payload }) => {
        if (payload.to === currentUserId) {
          if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (e) {
              console.error("Error adding ice candidate", e);
            }
          } else {
            // Queue candidates received before remote description is set
            pendingCandidatesRef.current.push(payload.candidate);
          }
        }
      })
      .on("broadcast", { event: "call_rejected" }, ({ payload }) => {
        if (payload.to === currentUserId) {
          recordCall("rejected");
          cleanup();
        }
      })
      .on("broadcast", { event: "call_hung_up" }, ({ payload }) => {
        if (payload.to === currentUserId) {
          recordCall("completed");
          cleanup();
        }
      })
      .on("broadcast", { event: "media_state" }, ({ payload }) => {
        if (payload.to === currentUserId) {
          if (payload.isVideoOff !== undefined) setRemoteIsVideoOff(payload.isVideoOff);
          if (payload.isMuted !== undefined) setRemoteIsMuted(payload.isMuted);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      cleanup();
      supabase.removeChannel(channel);
    };
  }, [currentUserId, contactId]);

  // Sync streams to video elements on state changes
  useEffect(() => {
    if (callState === "active" || callState === "calling") {
      if (callType === "video") {
        if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        if (remoteVideoRef.current && remoteStreamRef.current && remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
      } else if (callType === "audio") {
        if (audioOnlyRef.current && remoteStreamRef.current && audioOnlyRef.current.srcObject !== remoteStreamRef.current) {
          audioOnlyRef.current.srcObject = remoteStreamRef.current;
        }
      }
    }
  }, [callState, callType]);

  const broadcastMediaState = (muted: boolean, videoOff: boolean) => {
    channelRef.current?.send({
      type: "broadcast",
      event: "media_state",
      payload: { isMuted: muted, isVideoOff: videoOff, from: currentUserId, to: contactId }
    });
  };

  const initiateCall = async (type: CallType) => {
    setCallType(type);
    callMetaRef.current.isCaller = true;
    callMetaRef.current.startTime = null;
    
    // Slight delay to ensure callType state flushes before setupWebRTC
    setTimeout(async () => {
      setCallState("calling");
      const stream = await getMediaStream(type);
      if (!stream) {
        setCallState("idle");
        return;
      }

      const pc = await setupWebRTC();
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      channelRef.current?.send({
        type: "broadcast",
        event: "call_offer",
        payload: { offer, type, from: currentUserId, to: contactId }
      });
    }, 0);
  };

  const acceptCall = async () => {
    if (!callType) return;
    
    const stream = await getMediaStream(callType);
    if (!stream) {
      rejectCall();
      return;
    }

    const pc = await setupWebRTC();
    const pendingOffer = (window as any)._pendingOffer;
    if (pendingOffer) {
      await pc.setRemoteDescription(new RTCSessionDescription(pendingOffer));
      
      // Add any ICE candidates that were queued while waiting for user to accept
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error("Error adding queued ice candidate", e);
        }
      }
      pendingCandidatesRef.current = [];
    }
    
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channelRef.current?.send({
      type: "broadcast",
      event: "call_answer",
      payload: { answer, from: currentUserId, to: contactId }
    });

    callMetaRef.current.startTime = Date.now();
    setCallState("active");
  };

  const rejectCall = () => {
    channelRef.current?.send({
      type: "broadcast",
      event: "call_rejected",
      payload: { from: currentUserId, to: contactId }
    });
    cleanup();
  };

  const hangUp = () => {
    channelRef.current?.send({
      type: "broadcast",
      event: "call_hung_up",
      payload: { from: currentUserId, to: contactId }
    });
    recordCall(callMetaRef.current.startTime ? "completed" : "missed");
    cleanup();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        broadcastMediaState(!audioTrack.enabled, isVideoOff);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        broadcastMediaState(isMuted, !videoTrack.enabled);
      }
    }
  };

  return (
    <>
      {/* Media Error Toast */}
      <AnimatePresence>
        {mediaError && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-24 left-1/2 z-[200] bg-red-500/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl font-medium"
          >
            {mediaError}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {/* INCOMING CALL MODAL (Shared) */}
        {callState === "receiving" && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <div className="bg-white dark:bg-[#202020] rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center border border-border">
              <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-primary/5 rounded-full flex items-center justify-center mb-4 overflow-hidden relative">
                <div className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-50"></div>
                {contactAvatar ? (
                  <img src={contactAvatar} alt="avatar" className="w-full h-full object-cover relative z-10 rounded-full" />
                ) : (
                  callType === "video" ? <Video className="w-8 h-8 text-primary relative z-10 animate-pulse" /> : <Phone className="w-8 h-8 text-primary relative z-10 animate-pulse" />
                )}
              </div>
              <h3 className="text-xl font-semibold mb-1 text-foreground">
                Incoming {callType === "video" ? "Video " : ""}Call
              </h3>
              <p className="text-muted-foreground mb-8">from {contactName}</p>
              
              <div className="flex w-full gap-4">
                <button 
                  onClick={rejectCall}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl transition-colors font-medium"
                >
                  Decline
                </button>
                <button 
                  onClick={acceptCall}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-2xl transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {callType === "video" ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                  Accept
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* FULL SCREEN VIDEO UI */}
        {callType === "video" && (callState === "active" || callState === "calling") && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#111] flex flex-col overflow-hidden"
          >
            <div className="absolute inset-0 bg-[#0a0a0a] flex items-center justify-center">
              {callState === "calling" ? (
                <div className="flex flex-col items-center gap-6">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-primary animate-ping opacity-20"></div>
                    {contactAvatar ? (
                      <img src={contactAvatar} alt={contactName} className="w-full h-full object-cover relative z-10" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center relative z-10">
                        <Video className="w-12 h-12 text-white/50" />
                      </div>
                    )}
                  </div>
                  <div className="text-center">
                    <h2 className="text-2xl font-semibold text-white mb-2">Calling {contactName}...</h2>
                    <p className="text-white/50">Ringing...</p>
                  </div>
                </div>
              ) : (
                <>
                  <video 
                    ref={remoteVideoRef}
                    autoPlay 
                    playsInline 
                    className={`w-full h-full object-cover transition-opacity duration-500 ${remoteIsVideoOff ? 'opacity-0' : 'opacity-100'}`}
                  />
                  <AnimatePresence>
                    {remoteIsVideoOff && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center flex-col bg-black/60 backdrop-blur-2xl"
                      >
                        <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 mb-6 shadow-2xl">
                          {contactAvatar ? (
                            <img src={contactAvatar} alt={contactName} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center">
                              <VideoOff className="w-12 h-12 text-white/50" />
                            </div>
                          )}
                        </div>
                        <p className="text-white/70 text-lg font-medium">{contactName}'s camera is off</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>

            {callState === "active" && (
              <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start bg-gradient-to-b from-black/50 to-transparent z-10">
                <div className="flex flex-col drop-shadow-md">
                  <span className="text-white font-medium text-lg">{contactName}</span>
                  <span className="text-white/80 font-mono text-sm">{callDurationStr}</span>
                </div>
              </div>
            )}

            <motion.div 
              drag
              dragConstraints={{ top: 20, left: 20, right: 20, bottom: 120 }}
              className={`absolute bottom-28 right-6 w-28 h-40 md:w-40 md:h-56 bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl border border-white/20 z-20 cursor-move transition-transform active:scale-95`}
            >
              <video 
                ref={localVideoRef}
                autoPlay 
                playsInline 
                muted 
                className={`w-full h-full object-cover transform -scale-x-100 transition-opacity duration-300 ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
              />
              {isVideoOff && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <VideoOff className="w-8 h-8 text-white/50" />
                </div>
              )}
              {isMuted && (
                <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md p-1.5 rounded-md text-white">
                  <MicOff className="w-3.5 h-3.5" />
                </div>
              )}
            </motion.div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/40 backdrop-blur-xl border border-white/10 px-6 py-4 rounded-full z-30 shadow-2xl">
              <button 
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all ${isMuted ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button 
                onClick={toggleVideo}
                className={`p-4 rounded-full transition-all ${isVideoOff ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
                title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
              >
                {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
              </button>
              
              <div className="w-px h-8 bg-white/20 mx-2"></div>

              <button 
                onClick={hangUp}
                className="bg-red-500 hover:bg-red-600 text-white p-4 rounded-full transition-all shadow-lg shadow-red-500/20"
                title="End Call"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        )}

        {/* PILL AUDIO UI */}
        {callType === "audio" && (callState === "active" || callState === "calling") && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-black/90 dark:bg-white/10 backdrop-blur-md rounded-full px-6 py-3 flex items-center gap-4 shadow-2xl border border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-3 w-3">
                {callState === "active" && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-3 w-3 ${callState === "active" ? "bg-green-500" : "bg-yellow-500"}`}></span>
              </div>
              <span className="text-white text-sm font-medium">
                {callState === "calling" ? `Calling ${contactName}...` : callDurationStr}
              </span>
            </div>
            
            <div className="w-px h-6 bg-white/20 mx-1"></div>

            <button 
              onClick={toggleMute}
              className={`p-2 rounded-full transition-colors ${isMuted ? "bg-red-500/20 text-red-500" : "hover:bg-white/10 text-white"}`}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button 
              onClick={hangUp}
              className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors flex items-center justify-center"
            >
              <PhoneOff className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Invisible Audio Element for Audio-Only Calls */}
      {callType === "audio" && <audio ref={audioOnlyRef} autoPlay />}
      
      {/* Ringtone Audio Elements */}
      <audio ref={incomingAudioRef} src="/sounds/incoming.wav" loop preload="auto" />
      <audio ref={outgoingAudioRef} src="/sounds/outgoing.wav" loop preload="auto" />
    </>
  );
});

CallManager.displayName = "CallManager";
export default CallManager;
