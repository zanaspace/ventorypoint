"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Modal } from "@/components/ui/modal";
import { Printer, Shield, Copy, Check } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { toast } from "sonner";

interface BadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  worker: {
    worker_code: string;
    first_name: string;
    last_name?: string;
    badge_token: string;
    org_name?: string;
  } | null;
}

export function BadgeModal({ isOpen, onClose, worker }: BadgeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (worker?.badge_token) {
      QRCode.toDataURL(worker.badge_token, {
        width: 256,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [worker?.badge_token]);

  if (!worker) return null;

  const fullName = `${worker.first_name} ${worker.last_name || ""}`.trim();

  function handlePrint() {
    window.print();
  }

  function handleCopyToken() {
    if (worker?.badge_token) {
      navigator.clipboard.writeText(worker.badge_token);
      setCopied(true);
      toast.success("Badge token copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Floor Worker Badge" maxWidth="max-w-md">
      <div className="p-6 space-y-6">
        {/* Printable Badge Area */}
        <div id="printable-badge" className="mx-auto w-72 rounded-2xl border-2 border-border bg-white text-zinc-900 shadow-lg p-5 flex flex-col items-center gap-4 text-center">
          {/* Header */}
          <div className="flex items-center gap-2">
            <BrandMark className="size-6 rounded-md" />
            <span className="font-bold tracking-tight text-sm text-zinc-900 uppercase">
              {worker.org_name || "VentoryPoint"}
            </span>
          </div>

          <div className="w-full h-px bg-zinc-200" />

          {/* Worker Info */}
          <div>
            <div className="text-xl font-bold tracking-tight text-zinc-900">
              {fullName}
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-600 border border-purple-200">
              <Shield className="w-3 h-3" />
              Floor Worker
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-white p-2 rounded-xl border border-zinc-200 shadow-xs">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Badge QR Code" className="w-40 h-40 object-contain" />
            ) : (
              <div className="w-40 h-40 flex items-center justify-center text-xs text-zinc-400">
                Generating QR...
              </div>
            )}
          </div>

          {/* Badge ID */}
          <div className="space-y-0.5">
            <div className="font-mono text-sm font-bold tracking-wider text-zinc-800">
              {worker.worker_code}
            </div>
            <div className="text-[10px] text-zinc-400">
              Scan badge on registered terminal to sign in
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopyToken}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-md hover:bg-gray-50 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            Copy Token
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Badge Card
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
