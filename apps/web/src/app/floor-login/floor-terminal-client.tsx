"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginFloorWorker, logoutFloorWorker, type FloorWorkerSession } from "./actions";
import { useDeviceId } from "@/lib/device-id";

interface FloorTerminalClientProps {
  initialSession: FloorWorkerSession | null;
}

export function FloorTerminalClient({ initialSession }: FloorTerminalClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<FloorWorkerSession | null>(initialSession);
  const [badgeToken, setBadgeToken] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"badge" | "pin">("badge");
  const [errorMsg, setErrorMsg] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deviceId = useDeviceId();

  const badgeInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  // Auto focus badge input on load
  useEffect(() => {
    if (!session && step === "badge") {
      badgeInputRef.current?.focus();
    } else if (!session && step === "pin") {
      pinInputRef.current?.focus();
    }
  }, [session, step]);

  // Handle Barcode Scanner global capture
  useEffect(() => {
    if (session || step !== "badge") return;

    let buffer = "";
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in normal inputs other than barcode, ignore
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === "INPUT" && activeEl !== badgeInputRef.current) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        buffer = ""; // Reset buffer if slow (manual typing)
      }
      lastKeyTime = currentTime;

      if (e.key === "Enter") {
        if (buffer.startsWith("vp_badge_") || buffer.length >= 8) {
          e.preventDefault();
          setBadgeToken(buffer.trim());
          setStep("pin");
          setErrorMsg("");
          buffer = "";
        }
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [session, step]);

  const handleBadgeSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!badgeToken.trim()) {
      setErrorMsg("Please scan or enter a valid badge ID.");
      return;
    }
    setErrorMsg("");
    setStep("pin");
  };

  const handleKeypadPress = (val: string) => {
    if (isPending) return;
    setErrorMsg("");

    if (val === "clear") {
      setPin("");
    } else if (val === "backspace") {
      setPin((prev) => prev.slice(0, -1));
    } else if (val === "submit") {
      executeLogin();
    } else {
      if (pin.length < 6) {
        const nextPin = pin + val;
        setPin(nextPin);
        // Auto-submit if 6 digits reached
        if (nextPin.length === 6) {
          executeLogin(nextPin);
        }
      }
    }
  };

  const executeLogin = (pinToUse?: string) => {
    const currentPin = pinToUse || pin;
    if (currentPin.length < 4) {
      setErrorMsg("PIN must be at least 4 digits.");
      return;
    }

    startTransition(async () => {
      setErrorMsg("");
      const res = await loginFloorWorker(badgeToken, currentPin, deviceId);

      if (res.ok && res.session) {
        setSession(res.session);
        setPin("");
        setBadgeToken("");
        setStep("badge");
        setIsLocked(false);
      } else {
        setErrorMsg(res.error || "Authentication failed.");
        setIsLocked(!!res.locked);
        setPin("");
      }
    });
  };

  const handleSignOut = async () => {
    startTransition(async () => {
      await logoutFloorWorker();
      setSession(null);
      setBadgeToken("");
      setPin("");
      setStep("badge");
      setErrorMsg("");
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col justify-between p-4 md:p-8 selection:bg-purple-500 selection:text-white">
      {/* Header bar */}
      <header className="flex items-center justify-between border-b border-gray-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center font-bold text-primary-foreground text-lg shadow-sm">
            VP
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              VentoryPoint
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 border border-gray-700">
                Floor Terminal
              </span>
            </h1>
            <p className="text-xs text-gray-400">Warehouse Worker Fast-Auth Station</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Scanner Ready
          </div>
          <Link
            href="/login"
            className="text-xs font-medium text-gray-400 hover:text-white transition-colors bg-gray-900 hover:bg-gray-800 border border-gray-800 px-3 py-1.5 rounded-lg"
          >
            Management Login →
          </Link>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-md">
          {session ? (
            /* Active Worker Station View */
            <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                  Shift Active
                </span>
                <h2 className="text-2xl font-bold text-white mt-3">
                  {session.first_name} {session.last_name}
                </h2>
                <p className="text-sm font-mono text-purple-400 mt-1">{session.worker_code}</p>
                <p className="text-xs text-gray-400 mt-1">{session.organization_name}</p>
              </div>

              <div className="bg-gray-950 border border-gray-800/80 rounded-xl p-4 text-left space-y-2 text-xs">
                <div className="flex justify-between text-gray-400">
                  <span>Sign-in Time:</span>
                  <span className="font-medium text-gray-200 font-mono">
                    {new Date(session.login_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Facility Access:</span>
                  <span className="font-medium text-gray-200">
                    {session.all_facilities ? "All Facilities" : "Assigned Hubs"}
                  </span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Terminal:</span>
                  <span className="font-medium text-gray-200">
                    {session.device ? session.device.name : "Not identified"}
                  </span>
                </div>
              </div>

              {/* Floor events need an approved terminal assigned to a facility */}
              {(!session.device || !session.device.is_authorized || !session.device.facility_id) && (
                <div
                  role="status"
                  className="rounded-xl border border-amber-800/70 bg-amber-950/70 p-4 text-left text-amber-200"
                >
                  <p className="text-base font-semibold">
                    {session.device?.is_blocked
                      ? "This terminal has been blocked by a supervisor"
                      : !session.device || !session.device.is_authorized
                        ? "This terminal needs a supervisor's approval"
                        : "This terminal isn't assigned to a facility"}
                  </p>
                  <p className="mt-1 text-sm">
                    Ask a supervisor to open Devices in VentoryPoint
                    {session.device ? (
                      <>
                        {" "}and {session.device.is_blocked ? "unblock" : "approve"}{" "}
                        <span className="font-mono font-semibold">{session.device.name}</span>.
                      </>
                    ) : (
                      "."
                    )}{" "}
                    You can&apos;t record scans from this terminal until then.
                  </p>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => alert("Floor Task Execution workspace begins in Phase 1 - Sprint 06!")}
                  className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Open Floor Picking Workspace
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleSignOut}
                  className="w-full py-3 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-medium text-sm transition-all border border-gray-700"
                >
                  {isPending ? "Ending Shift..." : "End Shift / Sign Out"}
                </button>
              </div>
            </div>
          ) : (
            /* Login Steps */
            <div className="bg-gray-900/90 border border-gray-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm space-y-6">
              {/* Error banner */}
              {errorMsg && (
                <div
                  className={`p-4 rounded-xl text-sm font-medium border flex items-start gap-3 animate-in fade-in duration-150 ${
                    isLocked
                      ? "bg-red-950/80 border-red-800/80 text-red-200"
                      : "bg-amber-950/70 border-amber-800/70 text-amber-200"
                  }`}
                >
                  <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>{errorMsg}</div>
                </div>
              )}

              {step === "badge" ? (
                /* Step 1: Badge Entry / Scan */
                <div className="space-y-6">
                  <div className="text-center space-y-2">
                    <div className="mx-auto w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <h2 className="text-xl font-bold text-white">Scan Employee Badge</h2>
                    <p className="text-xs text-gray-400">
                      Point hardware scanner at badge QR / barcode, or type badge token below.
                    </p>
                  </div>

                  <form onSubmit={handleBadgeSubmit} className="space-y-4">
                    <div className="relative">
                      <input
                        ref={badgeInputRef}
                        type="text"
                        placeholder="Scan or type badge token (e.g. vp_badge_...)"
                        value={badgeToken}
                        onChange={(e) => setBadgeToken(e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl bg-gray-950 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-mono tracking-wide"
                        autoComplete="off"
                        autoFocus
                      />
                      <div className="absolute right-3 top-3.5 text-xs text-gray-500 uppercase tracking-wider font-semibold pointer-events-none">
                        Badge ID
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={!badgeToken.trim()}
                      className="w-full py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm transition-all shadow-lg shadow-purple-600/20"
                    >
                      Continue to PIN →
                    </button>
                  </form>
                </div>
              ) : (
                /* Step 2: PIN Keypad */
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setStep("badge");
                        setPin("");
                        setErrorMsg("");
                      }}
                      className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      ← Change Badge
                    </button>
                    <span className="text-xs font-mono text-purple-400 truncate max-w-[180px]">
                      {badgeToken}
                    </span>
                  </div>

                  <div className="text-center space-y-1">
                    <h2 className="text-xl font-bold text-white">Enter Security PIN</h2>
                    <p className="text-xs text-gray-400">Enter your 4 to 6 digit numerical PIN</p>
                  </div>

                  {/* PIN Display Dots */}
                  <div className="flex justify-center items-center gap-3 py-2">
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <div
                        key={idx}
                        className={`h-4 w-4 rounded-full border-2 transition-all duration-150 ${
                          pin.length > idx
                            ? "bg-purple-500 border-purple-400 scale-110 shadow-md shadow-purple-500/50"
                            : "border-gray-700 bg-gray-950"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Hidden physical input for hardware keyboard support */}
                  <input
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      setPin(val);
                      if (val.length >= 4 && e.target.value.length === 6) {
                        executeLogin(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && pin.length >= 4) {
                        executeLogin();
                      }
                    }}
                    className="sr-only"
                    autoFocus
                  />

                  {/* Touch/Mouse Keypad Grid */}
                  <div className="grid grid-cols-3 gap-2.5 max-w-[280px] mx-auto">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(num)}
                        disabled={isPending || isLocked}
                        className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white border border-gray-700/80 shadow-sm transition-all flex items-center justify-center cursor-pointer select-none"
                      >
                        {num}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => handleKeypadPress("clear")}
                      disabled={isPending || isLocked || pin.length === 0}
                      className="h-14 rounded-xl bg-gray-900 hover:bg-gray-800 active:scale-95 text-xs font-semibold text-gray-400 hover:text-white border border-gray-800 transition-all flex items-center justify-center cursor-pointer select-none"
                    >
                      CLEAR
                    </button>

                    <button
                      type="button"
                      onClick={() => handleKeypadPress("0")}
                      disabled={isPending || isLocked}
                      className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white border border-gray-700/80 shadow-sm transition-all flex items-center justify-center cursor-pointer select-none"
                    >
                      0
                    </button>

                    <button
                      type="button"
                      onClick={() => handleKeypadPress("backspace")}
                      disabled={isPending || isLocked || pin.length === 0}
                      className="h-14 rounded-xl bg-gray-900 hover:bg-gray-800 active:scale-95 text-gray-300 hover:text-white border border-gray-800 transition-all flex items-center justify-center cursor-pointer select-none"
                      aria-label="Backspace"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
                      </svg>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => executeLogin()}
                    disabled={isPending || isLocked || pin.length < 4}
                    className="w-full py-3.5 px-4 rounded-xl bg-primary hover:bg-primary-hover disabled:opacity-40 text-primary-foreground font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span>
                        Verifying PIN...
                      </>
                    ) : (
                      "Sign In →"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-500 py-2 border-t border-gray-900">
        VentoryPoint 3PL Cloud Terminal • Fast Shift Entry • Lockout Protection Active
      </footer>
    </div>
  );
}
