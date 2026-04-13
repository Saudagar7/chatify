import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { useShallow } from "zustand/react/shallow";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";
import {
  BarChart3Icon,
  FileTextIcon,
  ImageIcon,
  MicIcon,
  Music2Icon,
  PlusIcon,
  SendIcon,
  SmileIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import { formatStopwatch } from "../lib/time";

const formatFileSize = (bytes = 0) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  const precision = value >= 10 || idx === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[idx]}`;
};

function MessageInput({ prefillText = "", onPrefillConsumed }) {
  const [text, setText] = useState("");
  const [mediaAttachment, setMediaAttachment] = useState(null);
  const [fileAttachment, setFileAttachment] = useState(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [audioPreview, setAudioPreview] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPollComposerOpen, setIsPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [isSubmittingPoll, setIsSubmittingPoll] = useState(false);

  const mediaInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const textInputRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const emojiButtonRef = useRef(null);
  const attachmentMenuRef = useRef(null);
  const attachmentButtonRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioChunksRef = useRef([]);
  const discardRecordingRef = useRef(false);
  const streamRef = useRef(null);
  const recordingTimeRef = useRef(0);

  const { sendMessage, editingMessage, updateMessage, clearEditingMessage, selectedUser } = useChatStore(
    useShallow((state) => ({
      sendMessage: state.sendMessage,
      editingMessage: state.editingMessage,
      updateMessage: state.updateMessage,
      clearEditingMessage: state.clearEditingMessage,
      selectedUser: state.selectedUser,
    }))
  );
  const isEditing = Boolean(editingMessage);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        isEmojiPickerOpen &&
        !emojiPickerRef.current?.contains(event.target) &&
        !emojiButtonRef.current?.contains(event.target)
      ) {
        setIsEmojiPickerOpen(false);
      }

      if (
        isAttachmentMenuOpen &&
        !attachmentMenuRef.current?.contains(event.target) &&
        !attachmentButtonRef.current?.contains(event.target)
      ) {
        setIsAttachmentMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsEmojiPickerOpen(false);
        setIsAttachmentMenuOpen(false);
        if (isEditing) {
          clearEditingMessage();
          setText("");
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [
    isEmojiPickerOpen,
    isAttachmentMenuOpen,
    isEditing,
    clearEditingMessage,
  ]);

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text || "");
      setMediaAttachment(null);
      setFileAttachment(null);
      setAudioPreview(null);
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      if (documentInputRef.current) documentInputRef.current.value = "";
      if (audioFileInputRef.current) audioFileInputRef.current.value = "";
      setIsEmojiPickerOpen(false);
      setIsAttachmentMenuOpen(false);
      setIsPollComposerOpen(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollAllowMultiple(false);
    }
  }, [editingMessage]);

  useEffect(() => {
    resetPollComposer();
    setIsAttachmentMenuOpen(false);
  }, [selectedUser?._id]);

  useEffect(() => {
    if (!prefillText || isEditing) return;
    setText(prefillText);
    requestAnimationFrame(() => {
      textInputRef.current?.focus();
    });
    if (typeof onPrefillConsumed === "function") {
      onPrefillConsumed();
    }
  }, [prefillText, isEditing, onPrefillConsumed]);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearRecordingTimer();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (error) {
          console.warn("Unable to stop recorder", error);
        }
      }
      stopStream();
    };
  }, []);

  const persistRecordingPreview = (dataUrl, mimeType, elapsedMs, meta = {}) => {
    const fallbackDuration = Math.max(1, Math.round((elapsedMs || 0) / 1000));
    const audioElement = new Audio();
    audioElement.src = dataUrl;

    const applyPreview = (seconds) => {
      setAudioPreview({
        data: dataUrl,
        url: dataUrl,
        duration: seconds || fallbackDuration,
        mimeType,
        fileName: meta.fileName,
        sourceType: meta.sourceType || "recording",
      });
    };

    const handleLoaded = () => {
      applyPreview(Math.max(1, Math.round(audioElement.duration || fallbackDuration)));
      audioElement.removeEventListener("loadedmetadata", handleLoaded);
      audioElement.removeEventListener("error", handleError);
    };

    const handleError = () => {
      applyPreview(fallbackDuration);
      audioElement.removeEventListener("loadedmetadata", handleLoaded);
      audioElement.removeEventListener("error", handleError);
    };

    audioElement.addEventListener("loadedmetadata", handleLoaded);
    audioElement.addEventListener("error", handleError);
    audioElement.load();
  };

  const startRecording = async () => {
    if (isRecording) return;
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.mediaDevices) {
      toast.error("Microphone access is not supported in this browser");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      toast.error("Voice clips are not supported here yet");
      return;
    }

    try {
      setAudioPreview(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;
      recordingTimeRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const elapsedMs = recordingTimeRef.current;
        mediaRecorderRef.current = null;
        stopStream();
        clearRecordingTimer();
        setIsRecording(false);
        setRecordingTime(0);
        recordingTimeRef.current = 0;

        if (discardRecordingRef.current || !audioChunksRef.current.length) {
          audioChunksRef.current = [];
          return;
        }

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];

        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result !== "string") return;
          persistRecordingPreview(reader.result, blob.type, elapsedMs, { sourceType: "recording" });
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      clearRecordingTimer();
      recordingTimerRef.current = setInterval(() => {
        recordingTimeRef.current += 100;
        setRecordingTime(recordingTimeRef.current);
      }, 100);
    } catch (error) {
      console.error("Unable to start recording", error);
      toast.error("Unable to access the microphone");
      stopStream();
      clearRecordingTimer();
      setIsRecording(false);
    }
  };

  const finalizeRecording = (shouldSave = true) => {
    if (!mediaRecorderRef.current) return;
    discardRecordingRef.current = !shouldSave;
    const recorder = mediaRecorderRef.current;
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleCancelRecording = () => {
    setAudioPreview(null);
    finalizeRecording(false);
  };

  const handleRemoveVoicePreview = () => {
    setAudioPreview(null);
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
  };

  const handleMediaChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      toast.error("Please select an image or video file");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        toast.error("Unable to read media file");
        return;
      }
      setMediaAttachment({
        data: reader.result,
        url: reader.result,
        type: isImage ? "image" : "video",
        mimeType: file.type,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveMediaAttachment = () => {
    setMediaAttachment(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  };

  const handleAudioFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      toast.error("Please choose an audio file");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        toast.error("Unable to read audio file");
        return;
      }
      persistRecordingPreview(reader.result, file.type, undefined, {
        fileName: file.name,
        sourceType: "upload",
      });
    };
    reader.readAsDataURL(file);
  };

  const handleEmojiSelect = (emojiData) => {
    if (!emojiData?.emoji) return;
    setText((prev) => `${prev}${emojiData.emoji}`);
  };

  const handlePollOptionChange = (index, value) => {
    setPollOptions((prev) => prev.map((option, idx) => (idx === index ? value : option)));
  };

  const handleAddPollOption = () => {
    setPollOptions((prev) => (prev.length >= 10 ? prev : [...prev, ""]));
  };

  const handleRemovePollOption = (index) => {
    setPollOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const resetPollComposer = () => {
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollAllowMultiple(false);
    setIsPollComposerOpen(false);
    setIsSubmittingPoll(false);
  };

  const handleOpenPollComposer = () => {
    if (!selectedUser?._id) {
      toast.error("Select a chat before creating a poll");
      return;
    }
    if (!selectedUser.isGroup) {
      toast.error("Polls are only available in groups");
      return;
    }
    setIsPollComposerOpen(true);
    setIsAttachmentMenuOpen(false);
  };

  const handleCancelPollComposer = () => {
    resetPollComposer();
  };

  const handleSendPoll = async () => {
    if (!selectedUser?.isGroup) {
      toast.error("Polls can only be sent to groups");
      return;
    }
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean);
    if (!question || options.length < 2) {
      toast.error("Add a question and at least two answers");
      return;
    }
    try {
      setIsSubmittingPoll(true);
      await sendMessage({
        poll: {
          question,
          options,
          allowMultiple: pollAllowMultiple,
        },
      });
      resetPollComposer();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmittingPoll(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const trimmedText = text.trim();
    if (isEditing) {
      if (!trimmedText) {
        toast.error("Message cannot be empty");
        return;
      }
      const success = await updateMessage(editingMessage._id, trimmedText);
      if (success) {
        setText("");
        clearEditingMessage();
      }
      return;
    }
    if (!trimmedText && !mediaAttachment && !fileAttachment && !audioPreview) return;

    const audioPayload = audioPreview?.data ? audioPreview.data.split(",")[1] : undefined;
    const audioMimeType = audioPreview?.mimeType ? audioPreview.mimeType.split(";")[0] : undefined;

    const imagePayload = mediaAttachment?.type === "image" ? mediaAttachment.data : undefined;
    const videoPayload = mediaAttachment?.type === "video" ? mediaAttachment.data : undefined;
    const videoMimeType = mediaAttachment?.type === "video" ? mediaAttachment.mimeType : undefined;

    sendMessage({
      text: trimmedText,
      image: imagePayload,
      video: videoPayload,
      videoType: videoMimeType,
      file: fileAttachment?.data,
      fileName: fileAttachment?.name,
      fileSize: fileAttachment?.size,
      fileType: fileAttachment?.type,
      audio: audioPayload,
      audioType: audioMimeType,
      audioDuration: audioPreview?.duration,
    });
    setText("");
    setMediaAttachment(null);
    setFileAttachment(null);
    setAudioPreview(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    if (documentInputRef.current) documentInputRef.current.value = "";
    if (audioFileInputRef.current) audioFileInputRef.current.value = "";
    setIsEmojiPickerOpen(false);
    setIsAttachmentMenuOpen(false);
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        toast.error("Unable to read file");
        return;
      }
      setFileAttachment({
        data: reader.result,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      });
    };
    reader.readAsDataURL(file);
  };

  const removeFileAttachment = () => {
    setFileAttachment(null);
    if (documentInputRef.current) documentInputRef.current.value = "";
  };

  const hasTypedText = Boolean(text.trim());
  const hasMessagePayload = Boolean(hasTypedText || mediaAttachment || fileAttachment || audioPreview);
  const shouldShowSendButton = hasMessagePayload;
  const trimmedPollOptions = pollOptions.map((option) => option.trim()).filter(Boolean);
  const canSubmitPoll = Boolean(pollQuestion.trim()) && trimmedPollOptions.length >= 2;

  const iconButtonClassName =
    "w-10 h-10 flex items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/50 text-slate-400 hover:text-slate-100 hover:border-slate-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900";

  return (
    <div className="p-4 border-t border-slate-700/50">
      <div className="max-w-3xl mx-auto">
        {(isRecording || audioPreview || mediaAttachment || fileAttachment) && (
          <div className="mb-3 space-y-3">
            {isRecording && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                <div className="flex items-center gap-3 text-red-100">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />
                  <span className="text-sm font-semibold">{formatStopwatch(recordingTime)}</span>
                  <span className="text-xs uppercase tracking-wide text-red-200">Recording...</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelRecording}
                    className="rounded-full border border-red-400/60 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => finalizeRecording(true)}
                    className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-400"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}

            {audioPreview && (
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
                <VoiceMessagePlayer src={audioPreview.url} duration={audioPreview.duration} intent="dark" />
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {audioPreview.fileName ? `Attached: ${audioPreview.fileName}` : "Voice message ready"}
                  </span>
                  <button
                    type="button"
                    onClick={handleRemoveVoicePreview}
                    className="flex items-center gap-1 text-slate-200 hover:text-white"
                  >
                    <XIcon className="h-3.5 w-3.5" /> Remove
                  </button>
                </div>
              </div>
            )}

            {mediaAttachment && (
              <div className="flex items-center">
                <div className="relative">
                  {mediaAttachment.type === "image" ? (
                    <img
                      src={mediaAttachment.url}
                      alt="Selected"
                      className="w-24 h-24 object-cover rounded-xl border border-slate-700"
                    />
                  ) : (
                    <video
                      src={mediaAttachment.url}
                      controls
                      className="w-64 h-40 rounded-xl border border-slate-700 bg-black object-cover"
                    />
                  )}
                  <button
                    onClick={handleRemoveMediaAttachment}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700"
                    type="button"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {fileAttachment && (
              <div className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
                <div className="flex items-center gap-3">
                  <FileTextIcon className="h-8 w-8 text-amber-300" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{fileAttachment.name}</p>
                    <p className="text-xs text-slate-400">{formatFileSize(fileAttachment.size)}</p>
                  </div>
                </div>
                <button
                  onClick={removeFileAttachment}
                  className="text-slate-400 hover:text-white"
                  type="button"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {isEditing && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2">
            <div className="pr-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">Editing message</p>
              <p className="text-sm text-slate-100 line-clamp-2">
                {editingMessage?.text || "(no text)"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                clearEditingMessage();
                setText("");
              }}
              className="text-xs font-semibold text-amber-100 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

          {isPollComposerOpen && (
            <div className="mb-4 rounded-2xl border border-cyan-500/40 bg-slate-900/70 p-4 shadow-lg">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-cyan-200">Create a poll</p>
                  <p className="text-xs text-slate-400">Ask a question and collect votes.</p>
                </div>
                <button
                  type="button"
                  onClick={handleCancelPollComposer}
                  className="text-xs font-semibold text-slate-300 hover:text-white"
                >
                  Cancel
                </button>
              </div>
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                className="mb-3 w-full rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                placeholder="What's your question?"
              />
              <div className="space-y-2">
                {pollOptions.map((option, index) => (
                  <div key={`poll-option-${index}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handlePollOptionChange(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      className="flex-1 rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemovePollOption(index)}
                        className="rounded-full border border-slate-600/70 p-1 text-slate-300 hover:text-white"
                        aria-label="Remove option"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddPollOption}
                  disabled={pollOptions.length >= 10}
                  className="rounded-full border border-cyan-500/50 px-3 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  Add option
                </button>
                <button
                  type="button"
                  onClick={() => setPollAllowMultiple((prev) => !prev)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    pollAllowMultiple
                      ? "border border-emerald-400/70 bg-emerald-500/20 text-emerald-200"
                      : "border border-slate-600/70 text-slate-300"
                  }`}
                >
                  {pollAllowMultiple ? "Multiple answers enabled" : "Single answer"}
                </button>
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  {pollOptions.length}/10 options
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {canSubmitPoll ? "Ready to send" : "Need a question and two answers"}
                </p>
                <button
                  type="button"
                  onClick={handleSendPoll}
                  disabled={!canSubmitPoll || isSubmittingPoll}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <SendIcon className="w-4 h-4" />
                  {isSubmittingPoll ? "Sending..." : "Send poll"}
                </button>
              </div>
            </div>
          )}

        <form onSubmit={handleSendMessage} className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2">
            <div className="relative">
              <button
                type="button"
                ref={attachmentButtonRef}
                className={`${iconButtonClassName} rounded-full ${
                  isAttachmentMenuOpen || mediaAttachment || fileAttachment || isPollComposerOpen
                    ? "text-cyan-400 border-cyan-500/60"
                    : ""
                } ${isEditing ? "opacity-60 cursor-not-allowed" : ""}`}
                disabled={isEditing}
                onClick={() => {
                  setIsAttachmentMenuOpen((prev) => !prev);
                  setIsEmojiPickerOpen(false);
                }}
                aria-label="Open attachment menu"
              >
                <PlusIcon className="w-5 h-5" />
              </button>
              {isAttachmentMenuOpen && (
                <div
                  ref={attachmentMenuRef}
                  className="absolute bottom-14 left-0 z-20 w-52 rounded-2xl border border-slate-700/60 bg-slate-900/95 p-2 shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false);
                      mediaInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/70"
                  >
                    <ImageIcon className="h-4 w-4 text-cyan-400" />
                    <span>Photo / Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false);
                      documentInputRef.current?.click();
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/70"
                  >
                    <FileTextIcon className="h-4 w-4 text-amber-300" />
                    <span>Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false);
                      audioFileInputRef.current?.click();
                    }}
                    className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-100 hover:bg-slate-800/70"
                  >
                    <Music2Icon className="h-4 w-4 text-emerald-300" />
                    <span>Audio</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachmentMenuOpen(false);
                      handleOpenPollComposer();
                    }}
                    disabled={!selectedUser?.isGroup}
                    className={`mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                      selectedUser?.isGroup
                        ? "text-slate-100 hover:bg-slate-800/70"
                        : "text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    <BarChart3Icon className="h-4 w-4 text-purple-300" />
                    <span>Poll</span>
                  </button>
                </div>
              )}
            </div>

            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              ref={textInputRef}
              className="flex-1 rounded-lg border border-slate-700/50 bg-slate-800/50 py-2.5 px-4 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              placeholder="Type your message..."
            />
          </div>

          <input
            type="file"
            accept="image/*,video/*"
            ref={mediaInputRef}
            onChange={handleMediaChange}
            className="hidden"
          />

          <input
            type="file"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,.rar,image/*"
            ref={documentInputRef}
            onChange={handleDocumentChange}
            className="hidden"
          />

          <input
            type="file"
            accept="audio/*"
            ref={audioFileInputRef}
            onChange={handleAudioFileChange}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                ref={emojiButtonRef}
                className={`${iconButtonClassName} ${
                  isEmojiPickerOpen ? "text-cyan-400 border-cyan-500/60" : ""
                }`}
                onClick={() => {
                  setIsEmojiPickerOpen((prev) => !prev);
                  setIsAttachmentMenuOpen(false);
                }}
                aria-label="Insert emoji"
              >
                <SmileIcon className="w-5 h-5" />
              </button>
              {isEmojiPickerOpen && (
                <div
                  ref={emojiPickerRef}
                  className="absolute bottom-14 right-0 z-20 w-[320px] rounded-2xl border border-slate-700/60 bg-slate-900/95 p-2 shadow-2xl"
                >
                  <EmojiPicker
                    onEmojiClick={handleEmojiSelect}
                    theme="dark"
                    lazyLoadEmojis
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                    searchPlaceHolder="Search"
                    width="100%"
                    height={380}
                  />
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                if (isRecording) {
                  finalizeRecording(true);
                } else {
                  startRecording();
                }
              }}
              aria-pressed={isRecording}
              disabled={isEditing}
              className={`${iconButtonClassName} ${
                isRecording ? "border-red-400/70 text-red-200 bg-red-500/20" : ""
              } ${isEditing ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {isRecording ? <SquareIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
            </button>

            {shouldShowSendButton && (
              <button
                type="submit"
                disabled={!hasMessagePayload}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-lg transition-all hover:from-cyan-600 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
export default MessageInput;