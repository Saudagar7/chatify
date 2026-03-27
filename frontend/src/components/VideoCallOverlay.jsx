import { useEffect, useMemo, useRef } from "react";
import {
  Loader2Icon,
  MicIcon,
  MicOffIcon,
  PhoneIncomingIcon,
  PhoneOffIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import { useCallStore, CALL_STATES } from "../store/useCallStore";
import { useAuthStore } from "../store/useAuthStore";

function VideoCallOverlay() {
  const callState = useCallStore((state) => state.callState);
  const direction = useCallStore((state) => state.direction);
  const callUser = useCallStore((state) => state.callUser);
  const localStream = useCallStore((state) => state.localStream);
  const remoteStream = useCallStore((state) => state.remoteStream);
  const isMuted = useCallStore((state) => state.isMuted);
  const isCameraDisabled = useCallStore((state) => state.isCameraDisabled);
  const acceptIncomingCall = useCallStore((state) => state.acceptIncomingCall);
  const declineIncomingCall = useCallStore((state) => state.declineIncomingCall);
  const endCall = useCallStore((state) => state.endCall);
  const toggleMute = useCallStore((state) => state.toggleMute);
  const toggleCamera = useCallStore((state) => state.toggleCamera);
  const bindSocketEvents = useCallStore((state) => state.bindSocketEvents);
  const unbindSocketEvents = useCallStore((state) => state.unbindSocketEvents);

  const socket = useAuthStore((state) => state.socket);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (!socket) return undefined;
    bindSocketEvents(socket);
    return () => unbindSocketEvents(socket);
  }, [socket, bindSocketEvents, unbindSocketEvents]);

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream || null;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream || null;
    }
  }, [remoteStream]);

  const statusLabel = useMemo(() => {
    switch (callState) {
      case CALL_STATES.CALLING:
        return "Calling...";
      case CALL_STATES.RINGING:
        return direction === "incoming" ? "Incoming video call" : "Ringing...";
      case CALL_STATES.CONNECTING:
        return "Connecting...";
      case CALL_STATES.CONNECTED:
        return "Connected";
      default:
        return "";
    }
  }, [callState, direction]);

  if (callState === CALL_STATES.IDLE) {
    return null;
  }

  const isIncoming = direction === "incoming" && callState === CALL_STATES.RINGING;
  const showRemoteVideo = Boolean(remoteStream) && callState === CALL_STATES.CONNECTED;

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-slate-950/90 backdrop-blur-md">
      <div className="relative m-6 flex-1 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
        {showRemoteVideo ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-slate-300">
            <img
              src={callUser?.profilePic || "/avatar.png"}
              alt={callUser?.fullName || "Participant"}
              className="h-24 w-24 rounded-full object-cover"
            />
            <p className="text-lg font-semibold">{callUser?.fullName || "Participant"}</p>
            <p className="text-sm text-slate-400">{statusLabel || "Waiting for the call"}</p>
            {callState === CALL_STATES.CALLING && (
              <Loader2Icon className="h-6 w-6 animate-spin text-cyan-300" />
            )}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-4 right-4 h-32 w-48 overflow-hidden rounded-xl border border-white/20 bg-slate-900/70">
          {localStream ? (
            <video
              ref={localVideoRef}
              muted
              autoPlay
              playsInline
              className={`h-full w-full object-cover ${isCameraDisabled ? "opacity-40" : ""}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-slate-300">
              Camera preview
            </div>
          )}
          {isCameraDisabled && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-slate-900/80 px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-wide">
              Camera off
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 pb-6 text-center text-slate-50">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-300">{statusLabel}</p>
        <div>
          <p className="text-2xl font-semibold">{callUser?.fullName || "Participant"}</p>
          <p className="text-sm text-slate-400">{isIncoming ? "is calling you" : "video call"}</p>
        </div>

        {isIncoming ? (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={acceptIncomingCall}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400"
              aria-label="Accept call"
            >
              <PhoneIncomingIcon className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={declineIncomingCall}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition hover:bg-rose-500"
              aria-label="Decline call"
            >
              <PhoneOffIcon className="h-6 w-6" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleCamera}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              aria-label={isCameraDisabled ? "Turn camera on" : "Turn camera off"}
            >
              {isCameraDisabled ? <VideoOffIcon className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
              aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            >
              {isMuted ? <MicOffIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => endCall("hangup")}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition hover:bg-rose-500"
              aria-label="Hang up"
            >
              <PhoneOffIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoCallOverlay;
