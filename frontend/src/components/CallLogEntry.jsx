import { memo } from "react";
import {
  PhoneIncomingIcon,
  PhoneOutgoingIcon,
  PhoneMissedIcon,
  PhoneCallIcon,
  VideoIcon,
  RefreshCcwIcon,
} from "lucide-react";
import { normalizeId } from "../lib/conversationUtils";

const toneStyles = {
  success: {
    badge: "bg-emerald-500/20 text-emerald-200",
    text: "text-emerald-200",
  },
  danger: {
    badge: "bg-rose-500/20 text-rose-200",
    text: "text-rose-200",
  },
  warning: {
    badge: "bg-amber-500/20 text-amber-200",
    text: "text-amber-200",
  },
  muted: {
    badge: "bg-slate-600/40 text-slate-200",
    text: "text-slate-200",
  },
};

const formatDuration = (seconds = 0) => {
  const numeric = Number(seconds) || 0;
  if (numeric <= 0) return null;
  const minutes = Math.floor(numeric / 60);
  const remainder = numeric % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
};

const resolveStatusPresentation = (status, initiatedByMe, endedByMe, callLabel) => {
  switch (status) {
    case "completed":
      return { label: `Call completed`, tone: "success" };
    case "missed":
    case "unanswered":
      return {
        label: initiatedByMe ? `No answer (${callLabel})` : `Missed ${callLabel}`,
        tone: initiatedByMe ? "warning" : "danger",
      };
    case "declined":
      return {
        label: endedByMe ? `You declined the ${callLabel}` : `Declined ${callLabel}`,
        tone: endedByMe ? "warning" : "danger",
      };
    case "cancelled":
      return {
        label: initiatedByMe ? `Cancelled ${callLabel}` : `Call cancelled`,
        tone: "muted",
      };
    case "busy":
      return {
        label: initiatedByMe ? `User busy (${callLabel})` : `You were busy (${callLabel})`,
        tone: "warning",
      };
    case "failed":
      return { label: "Connection lost", tone: "warning" };
    default:
      return { label: `Call update`, tone: "muted" };
  }
};

function CallLogEntry({ metadata = {}, authUserId, onCallAgain, disableCallAgain }) {
  const viewerId = normalizeId(authUserId);
  const initiatedByMe = normalizeId(metadata.initiatedBy) === viewerId;
  const endedByMe = normalizeId(metadata.endedBy) === viewerId;
  const status = (metadata.status || "").toLowerCase();
  const callLabel = metadata.callType === "audio" ? "voice call" : "video call";
  const durationLabel = status === "completed" ? formatDuration(metadata.durationSeconds) : null;
  const { label, tone } = resolveStatusPresentation(status, initiatedByMe, endedByMe, callLabel);
  const toneStyle = toneStyles[tone] || toneStyles.muted;
  const DirectionIcon =
    status === "missed" || status === "unanswered"
      ? PhoneMissedIcon
      : initiatedByMe
      ? PhoneOutgoingIcon
      : PhoneIncomingIcon;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded-full ${toneStyle.badge}`}>
          <DirectionIcon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold capitalize">{callLabel}</p>
          <p className={`text-xs ${toneStyle.text}`}>{label}</p>
          {durationLabel && (
            <p className="text-[11px] text-slate-200/80">Duration {durationLabel}</p>
          )}
        </div>
        {metadata.callType === "audio" ? (
          <PhoneCallIcon className="h-4 w-4 text-slate-100/80" />
        ) : (
          <VideoIcon className="h-4 w-4 text-slate-100/80" />
        )}
      </div>
      {onCallAgain && (
        <button
          type="button"
          onClick={onCallAgain}
          disabled={disableCallAgain}
          className={`inline-flex items-center gap-2 self-start rounded-full border px-3 py-1 text-xs font-semibold transition ${
            disableCallAgain
              ? "cursor-not-allowed border-slate-700/50 text-slate-500"
              : "border-cyan-400/70 text-cyan-100 hover:border-cyan-200/80 hover:text-white"
          }`}
        >
          <RefreshCcwIcon className="h-3.5 w-3.5" />
          Call again
        </button>
      )}
    </div>
  );
}

export default memo(CallLogEntry);
