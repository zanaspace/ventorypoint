"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "vp_device_id";
let memoryFallback: string | null = null;

function generateId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Persistent ID for this browser, sent at floor login so the server can register
 * the terminal (Sprint 2 §3.5). Falls back to an in-memory ID when storage is blocked.
 */
export function getDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateId();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    memoryFallback ??= generateId();
    return memoryFallback;
  }
}

const noopSubscribe = () => () => {};

/** Device ID in client components (null during server rendering). */
export function useDeviceId(): string | null {
  return useSyncExternalStore(noopSubscribe, getDeviceId, () => null);
}
