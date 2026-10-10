"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { CameraOff, X } from "lucide-react";

interface CameraScannerProps {
  /** Called once with the decoded text; the camera stops right after. */
  onResult: (text: string) => void;
  onClose: () => void;
  title?: string;
}

/**
 * Full-screen camera scanner for floor terminals (QR + 1D barcodes).
 * Uses the back camera when there is one. The browser asks for camera permission
 * the first time; it only works over HTTPS or on localhost.
 */
export function CameraScanner({ onResult, onClose, title = "Scan your badge" }: CameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let done = false;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError("The camera only works over HTTPS (or on localhost) in a browser that supports it.");
        return;
      }
      try {
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current!,
          (result) => {
            if (result && !done) {
              done = true;
              controls?.stop();
              navigator.vibrate?.(80);
              onResultRef.current(result.getText());
            }
          }
        );
        if (done) controls.stop();
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("Camera access is blocked. Allow the camera for this site (lock icon in the address bar), then try again.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("No camera was found on this device. Use a barcode scanner or type the badge code.");
        } else if (name === "NotReadableError") {
          setError("The camera is in use by another app. Close it and try again.");
        } else {
          setError("The camera couldn't start. Use a barcode scanner or type the badge code.");
        }
      }
    }

    start();
    return () => {
      done = true;
      controls?.stop();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xl font-bold text-white">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close camera"
          className="grid size-14 place-items-center rounded-xl bg-gray-800 text-white hover:bg-gray-700"
        >
          <X className="size-7" />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {error ? (
          <div className="mx-6 max-w-md text-center text-white" role="alert">
            <CameraOff className="mx-auto mb-4 size-12 text-gray-400" />
            <p className="text-xl font-semibold">{error}</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {/* Aiming frame */}
            <div aria-hidden="true" className="pointer-events-none absolute size-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
            <p className="absolute bottom-8 left-0 right-0 text-center text-xl font-medium text-white">
              Hold the badge code inside the frame
            </p>
          </>
        )}
      </div>
    </div>
  );
}
