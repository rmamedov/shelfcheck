"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface CameraCaptureProps {
  onCapture: (blob: Blob) => void;
  onClose: () => void;
  guideText?: string;
}

export function CameraCapture({
  onCapture,
  onClose,
  guideText,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment"
  );
  const [error, setError] = useState<string | null>(null);
  const [flashSupported, setFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(
    async (facing: "environment" | "user") => {
      try {
        // Stop existing stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }

        // Check flash support
        const track = stream.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const capabilities = track.getCapabilities() as any;
        if (capabilities?.torch) {
          setFlashSupported(true);
        } else {
          setFlashSupported(false);
        }

        setError(null);
      } catch (err) {
        console.error("Camera error:", err);
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError(
            "Доступ до камери заборонено. Дозвольте доступ у налаштуваннях браузера."
          );
        } else {
          setError("Не вдалося відкрити камеру. Перевірте підключення.");
        }
      }
    },
    []
  );

  useEffect(() => {
    startCamera(facingMode);

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSwitchCamera() {
    const newFacing = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacing);
    setReady(false);
    startCamera(newFacing);
  }

  async function handleToggleFlash() {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    const newState = !flashOn;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (track as any).applyConstraints({
        advanced: [{ torch: newState }],
      });
      setFlashOn(newState);
    } catch {
      // ignore
    }
  }

  function handleCapture() {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.9
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-[70] bg-black flex flex-col items-center justify-center p-6">
        <svg
          className="w-16 h-16 text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z"
          />
        </svg>
        <p className="text-white text-center text-sm mb-6">{error}</p>
        <button
          onClick={onClose}
          className="px-6 h-11 bg-white/10 text-white rounded-xl text-sm font-medium active:bg-white/20"
        >
          Закрити
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      {/* Top controls */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 safe-area-top">
        <button
          onClick={onClose}
          className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white active:bg-black/60"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>

        {guideText && (
          <div className="bg-black/40 backdrop-blur-sm rounded-xl px-3 py-1.5">
            <p className="text-white text-xs font-medium">{guideText}</p>
          </div>
        )}

        {flashSupported && (
          <button
            onClick={handleToggleFlash}
            className={`w-10 h-10 rounded-full flex items-center justify-center active:opacity-80 ${
              flashOn
                ? "bg-yellow-400 text-black"
                : "bg-black/40 backdrop-blur-sm text-white"
            }`}
          >
            <svg
              className="w-5 h-5"
              fill={flashOn ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Video viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />

        {/* Guide overlay */}
        {ready && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Semi-transparent border */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="border-2 border-dashed border-white/60 rounded-2xl"
                style={{ width: "85%", height: "45%" }}
              />
            </div>
            {/* Corner marks */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="relative"
                style={{ width: "85%", height: "45%" }}
              >
                {/* Top-left */}
                <div className="absolute -top-px -left-px w-6 h-6 border-t-3 border-l-3 border-white rounded-tl-lg" />
                {/* Top-right */}
                <div className="absolute -top-px -right-px w-6 h-6 border-t-3 border-r-3 border-white rounded-tr-lg" />
                {/* Bottom-left */}
                <div className="absolute -bottom-px -left-px w-6 h-6 border-b-3 border-l-3 border-white rounded-bl-lg" />
                {/* Bottom-right */}
                <div className="absolute -bottom-px -right-px w-6 h-6 border-b-3 border-r-3 border-white rounded-br-lg" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-black/80 safe-area-bottom">
        <div className="flex items-center justify-center gap-8 py-6 px-4">
          {/* Spacer */}
          <div className="w-12" />

          {/* Capture button */}
          <button
            onClick={handleCapture}
            className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center active:scale-95 transition-transform"
          >
            <div className="w-[58px] h-[58px] bg-white rounded-full" />
          </button>

          {/* Switch camera */}
          <button
            onClick={handleSwitchCamera}
            className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white active:bg-white/20"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
