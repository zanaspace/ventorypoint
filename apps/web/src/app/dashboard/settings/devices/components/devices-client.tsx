"use client";

import { useMemo, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  MonitorSmartphone,
  Pencil,
  Plus,
  ShieldCheck,
  ShieldOff,
  Unlock,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { useDeviceId } from "@/lib/device-id";
import { registerDevice, retireDevice, setRequireDeviceApproval, updateDevice } from "../actions";

export interface DeviceRow {
  id: string;
  device_name: string;
  device_type: string;
  facility_id: string | null;
  is_authorized: boolean;
  blocked_at: string | null;
  retired_at: string | null;
  last_active_at: string | null;
  created_at: string;
}

interface FacilityOption {
  id: string;
  name: string;
  code: string;
}

const DEVICE_TYPE_OPTIONS = [
  { value: "browser", label: "Browser workstation" },
  { value: "tablet", label: "Tablet / pick cart" },
  { value: "scanner", label: "Handheld scanner" },
  { value: "kiosk", label: "Kiosk" },
  { value: "printer_station", label: "Pack / print station" },
];

type Status = "pending" | "blocked" | "no_facility" | "approved" | "retired";

function statusOf(d: DeviceRow): Status {
  if (d.retired_at) return "retired";
  if (d.blocked_at) return "blocked";
  if (!d.is_authorized) return "pending";
  if (!d.facility_id) return "no_facility";
  return "approved";
}

const STATUS_ORDER: Record<Status, number> = { pending: 0, blocked: 1, no_facility: 2, approved: 3, retired: 4 };

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, { cls: string; label: string; Icon: typeof Clock }> = {
    pending: { cls: "bg-warning-soft text-warning-text", label: "Waiting for approval", Icon: Clock },
    no_facility: { cls: "bg-warning-soft text-warning-text", label: "No warehouse yet", Icon: AlertTriangle },
    approved: { cls: "bg-success-soft text-success-text", label: "Active", Icon: CheckCircle2 },
    blocked: { cls: "bg-danger-soft text-danger-text", label: "Blocked", Icon: ShieldOff },
    retired: { cls: "bg-muted text-muted-foreground", label: "Retired", Icon: Ban },
  };
  const { cls, label, Icon } = styles[status];
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${cls}`}>
      <Icon className="size-3.5" strokeWidth={1.75} />
      {label}
    </span>
  );
}

interface EditState {
  mode: "register" | "edit";
  device?: DeviceRow;
  name: string;
  deviceType: string;
  facilityId: string;
}

export function DevicesClient({
  devices,
  facilities,
  requireApproval,
  canConfigure,
  loadError,
}: {
  devices: DeviceRow[];
  facilities: FacilityOption[];
  requireApproval: boolean;
  canConfigure: boolean;
  loadError?: string | null;
}) {
  const deviceId = useDeviceId();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [isPending, startTransition] = useTransition();

  const facilityOptions = facilities.map((f) => ({ value: f.id, label: `${f.name} (${f.code})` }));
  const facilityName = (id: string | null) => {
    const f = facilities.find((x) => x.id === id);
    return f ? `${f.name} (${f.code})` : null;
  };

  const sorted = useMemo(
    () => [...devices].sort((a, b) => STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]),
    [devices]
  );
  const pendingCount = devices.filter((d) => statusOf(d) === "pending").length;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        setEditing(null);
      } else {
        toast.error(res.error || "Something went wrong.");
      }
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (editing.mode === "register") {
      if (!deviceId) return;
      run(
        () =>
          registerDevice({
            deviceToken: deviceId,
            name: editing.name,
            deviceType: editing.deviceType,
            facilityId: editing.facilityId || null,
          }),
        "This browser is registered as an active device."
      );
    } else if (editing.device) {
      run(
        () =>
          updateDevice({
            deviceId: editing.device!.id,
            name: editing.name,
            facilityId: editing.facilityId || null,
          }),
        "Device updated."
      );
    }
  }

  function handleRetire(d: DeviceRow) {
    if (!confirm(`Retire "${d.device_name}"? Anyone signed in on it is signed out, and it can't record scans until it's registered again.`)) {
      return;
    }
    run(() => retireDevice(d.id), `${d.device_name} retired.`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight text-foreground">Devices</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Floor terminals register themselves the first time a worker signs in with their badge. Use this page to rename them,
            change their warehouse, or block one that&apos;s lost or broken.
          </p>
        </div>
        <button
          type="button"
          disabled={!deviceId}
          onClick={() =>
            setEditing({ mode: "register", name: "", deviceType: "browser", facilityId: facilities[0]?.id ?? "" })
          }
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          <Plus className="size-4" />
          Register this browser
        </button>
      </div>

      {loadError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-danger-soft p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-text" strokeWidth={1.75} />
          <p className="text-sm font-medium text-danger-text">{loadError}</p>
        </div>
      )}

      {canConfigure && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p id="approval-label" className="text-sm font-semibold text-foreground">Require approval for new terminals</p>
            <p id="approval-desc" className="text-sm text-muted-foreground">
              {requireApproval
                ? "On: a supervisor must approve each new terminal before it can record scans."
                : "Off: workers can scan as soon as they sign in on a new terminal. Turn on for stricter control."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={requireApproval}
            aria-labelledby="approval-label"
            aria-describedby="approval-desc"
            disabled={isPending}
            onClick={() =>
              run(
                () => setRequireDeviceApproval(!requireApproval),
                !requireApproval ? "New terminals now need approval." : "New terminals can scan right away."
              )
            }
            className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors disabled:opacity-45 ${
              requireApproval ? "bg-brand" : "bg-input"
            }`}
          >
            <span
              className={`absolute left-[3px] top-[3px] size-[18px] rounded-full bg-white shadow transition-transform ${
                requireApproval ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
      )}

      {pendingCount > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
          <Clock className="mt-0.5 size-5 shrink-0 text-warning-text" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {pendingCount} {pendingCount === 1 ? "device is" : "devices are"} waiting for approval
            </p>
            <p className="text-sm text-muted-foreground">
              Your organization requires approval for new terminals. Check the name shown on the terminal, then approve it.
            </p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="devices-heading">
        <h2 id="devices-heading" className="sr-only">Registered devices</h2>
        {sorted.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-accent text-brand-text">
              <MonitorSmartphone className="size-6" strokeWidth={1.5} />
            </span>
            <p className="font-heading text-base font-medium text-foreground">No devices yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Terminals appear here automatically after a worker signs in on them with their badge.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-surface text-xs font-semibold text-muted-foreground">
                  <th className="px-5 py-3">Device</th>
                  <th className="px-5 py-3">Facility</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Last seen</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((d) => {
                  const status = statusOf(d);
                  const actions = [];
                  if (status === "pending") {
                    actions.push({
                      label: "Approve",
                      icon: <ShieldCheck />,
                      onClick: () => run(() => updateDevice({ deviceId: d.id, isAuthorized: true }), `${d.device_name} approved.`),
                    });
                  }
                  if (status === "blocked") {
                    actions.push({
                      label: "Unblock",
                      icon: <Unlock />,
                      onClick: () => run(() => updateDevice({ deviceId: d.id, isAuthorized: true }), `${d.device_name} unblocked.`),
                    });
                  }
                  if (status !== "retired") {
                    actions.push({
                      label: "Rename / assign facility",
                      icon: <Pencil />,
                      onClick: () =>
                        setEditing({ mode: "edit", device: d, name: d.device_name, deviceType: d.device_type, facilityId: d.facility_id ?? "" }),
                    });
                    if (status === "approved" || status === "no_facility") {
                      actions.push({
                        label: "Block",
                        icon: <ShieldOff />,
                        onClick: () => run(() => updateDevice({ deviceId: d.id, isAuthorized: false }), `${d.device_name} blocked.`),
                      });
                    }
                    actions.push({ label: "Retire", icon: <Ban />, danger: true, onClick: () => handleRetire(d) });
                  }

                  return (
                    <tr key={d.id} className={status === "retired" ? "opacity-60" : "hover:bg-accent/40"}>
                      <td className="px-5 py-3">
                        <div className="text-sm font-semibold text-foreground">{d.device_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {DEVICE_TYPE_OPTIONS.find((o) => o.value === d.device_type)?.label ?? d.device_type}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {facilityName(d.facility_id) ?? <span className="text-muted-foreground">Not assigned</span>}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={status} />
                        {status === "blocked" && d.blocked_at && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            Blocked {formatDistanceToNow(new Date(d.blocked_at), { addSuffix: true })}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-muted-foreground">
                        {d.last_active_at ? formatDistanceToNow(new Date(d.last_active_at), { addSuffix: true }) : "Never"}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {actions.length > 0 && <ActionDropdown actions={actions} label={`Actions for ${d.device_name}`} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.mode === "register" ? "Register this browser" : "Edit device"}
      >
        {editing && (
          <form onSubmit={handleSave} className="flex flex-col gap-4 p-6">
            {editing.mode === "register" && (
              <p className="text-sm text-muted-foreground">
                Use this on the computer or tablet that will run the floor terminal. It is approved immediately.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="device-name" className="text-sm font-semibold text-foreground">Name</label>
              <input
                id="device-name"
                required
                maxLength={80}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Dock 3 terminal"
                className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-gray-500 focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/20"
              />
            </div>
            {editing.mode === "register" && (
              <div className="flex flex-col gap-1.5">
                <span id="device-type-label" className="text-sm font-semibold text-foreground">Type</span>
                <SearchableSelect
                  aria-labelledby="device-type-label"
                  options={DEVICE_TYPE_OPTIONS}
                  value={editing.deviceType}
                  onChange={(v) => setEditing({ ...editing, deviceType: v })}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span id="device-facility-label" className="text-sm font-semibold text-foreground">Facility</span>
              <SearchableSelect
                aria-labelledby="device-facility-label"
                placeholder="Select a facility"
                options={facilityOptions}
                value={editing.facilityId}
                onChange={(v) => setEditing({ ...editing, facilityId: v })}
              />
              <span className="text-xs text-muted-foreground">Scans from this device are recorded against this facility.</span>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex h-10 items-center rounded-md border border-input px-4 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
              >
                {isPending ? "Saving…" : editing.mode === "register" ? "Register device" : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
