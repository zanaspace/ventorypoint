"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";

/** A warehouse event as broadcast on facility:{id} / org:{id} channels. */
export interface FacilityEvent {
  id: string;
  sequence: number;
  organization_id: string;
  facility_id: string | null;
  client_account_id: string | null;
  event_type: string;
  event_version: number;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  actor_user_id: string | null;
  actor_worker_id: string | null;
  device_id: string | null;
  source: string;
  correlation_id: string | null;
  occurred_at: string;
  received_at: string;
}

export type RealtimeStatus = "connecting" | "live" | "error" | "closed";

interface Options {
  /** Facilities to listen to. Users only receive facilities they have access to. */
  facilityIds?: string[];
  /** Also listen to organization-level events (no facility). */
  organizationId?: string;
  /** Only these event types (default: all). */
  eventTypes?: string[];
  enabled?: boolean;
  onEvent: (event: FacilityEvent) => void;
}

/**
 * Subscribes to live warehouse events (Sprint 2 §3.3). Channels are private and
 * authorized server-side by the same rules as reading warehouse_events.
 */
export function useFacilityEvents({ facilityIds = [], organizationId, eventTypes, enabled = true, onEvent }: Options) {
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const onEventRef = useRef(onEvent);
  const typesRef = useRef(eventTypes);

  useEffect(() => {
    onEventRef.current = onEvent;
    typesRef.current = eventTypes;
  });

  const topicsKey = [
    ...facilityIds.map((id) => `facility:${id}`),
    ...(organizationId ? [`org:${organizationId}`] : []),
  ]
    .sort()
    .join(",");

  useEffect(() => {
    if (!enabled || !topicsKey) return;
    const supabase = createClient();
    const topics = topicsKey.split(",");
    const states = new Map<string, string>();
    let cancelled = false;

    const report = () => {
      if (cancelled) return;
      const values = [...states.values()];
      if (values.some((s) => s === "CHANNEL_ERROR" || s === "TIMED_OUT")) setStatus("error");
      else if (values.length === topics.length && values.every((s) => s === "SUBSCRIBED")) setStatus("live");
      else if (values.some((s) => s === "CLOSED")) setStatus("closed");
      else setStatus("connecting");
    };

    const channels = topics.map((topic) =>
      supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: "warehouse_event" }, ({ payload }) => {
          const event = payload as FacilityEvent;
          const types = typesRef.current;
          if (!types || types.length === 0 || types.includes(event.event_type)) onEventRef.current(event);
        })
    );

    // Private channels need the user's access token before subscribing.
    supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channels.forEach((channel, i) =>
        channel.subscribe((state) => {
          states.set(topics[i], state);
          report();
        })
      );
    });

    return () => {
      cancelled = true;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [enabled, topicsKey]);

  return { status: enabled && topicsKey ? status : "closed" };
}
