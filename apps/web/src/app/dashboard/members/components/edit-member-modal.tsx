"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { updateMemberAccess } from "../actions";

export interface EditableMember {
  id: string;
  role: string;
  all_facilities: boolean;
  facility_ids: string[];
  displayName: string;
}

interface Props {
  member: EditableMember;
  callerRole: string;
  facilities: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (changes: { role: string; all_facilities: boolean; facility_ids: string[] }) => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  ops_manager: "Ops Manager",
  supervisor: "Supervisor",
  billing: "Billing",
  floor_worker: "Floor Worker",
  client_user: "Client User",
};

const ROLE_HINTS: Record<string, string> = {
  admin: "Manages members, settings and every module.",
  ops_manager: "Runs warehouse operations and floor workers.",
  supervisor: "Oversees the floor, approves devices and exceptions.",
  billing: "Billing screens plus read-only operations.",
};

/** Edit a member's role and facility access. The database applies the same rules (update_member_access). */
export function EditMemberModal({ member, callerRole, facilities, onClose, onSaved }: Props) {
  const [role, setRole] = useState(member.role);
  const [scope, setScope] = useState<"all" | "specific">(member.all_facilities ? "all" : "specific");
  const [selected, setSelected] = useState<string[]>(member.facility_ids);
  const [isPending, startTransition] = useTransition();

  // Which roles this caller may assign to this member
  const roleFixed =
    ["floor_worker", "client_user"].includes(member.role) || !["owner", "admin"].includes(callerRole);
  const roleOptions = (callerRole === "owner" ? ["admin", "ops_manager", "supervisor", "billing"] : ["ops_manager", "supervisor", "billing"])
    .map((value) => ({ value, label: ROLE_LABELS[value] }));

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const allFacilities = scope === "all";
    if (!allFacilities && selected.length === 0) {
      toast.error("Choose at least one facility, or give access to all facilities.");
      return;
    }
    startTransition(async () => {
      const res = await updateMemberAccess(member.id, role, allFacilities, allFacilities ? [] : selected);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${member.displayName} updated.`);
      onSaved({ role, all_facilities: allFacilities, facility_ids: allFacilities ? [] : selected });
    });
  }

  return (
    <Modal isOpen onClose={onClose} title="Edit role & facilities" maxWidth="max-w-lg">
      <form onSubmit={save} className="flex flex-col gap-5 p-6">
        <p className="text-sm text-muted-foreground">
          Changing access for <span className="font-semibold text-foreground">{member.displayName}</span>. Takes effect on their
          next page load and is recorded in Change history.
        </p>

        {/* Role */}
        <div className="flex flex-col gap-1.5">
          <span id="edit-role-label" className="text-sm font-semibold text-foreground">Role</span>
          {roleFixed ? (
            <div className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2.5 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-semibold">{ROLE_LABELS[member.role] ?? member.role}</span>
                <span className="text-muted-foreground">
                  {member.role === "floor_worker"
                    ? " (badge accounts keep this role; you can change their facilities)"
                    : member.role === "client_user"
                      ? " (client users keep this role)"
                      : " (only owners and admins can change roles)"}
                </span>
              </span>
            </div>
          ) : (
            <>
              <SearchableSelect
                aria-labelledby="edit-role-label"
                searchable={false}
                options={roleOptions}
                value={role}
                onChange={setRole}
              />
              {ROLE_HINTS[role] && <span className="text-xs text-muted-foreground">{ROLE_HINTS[role]}</span>}
            </>
          )}
        </div>

        {/* Facilities */}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-foreground">Facility access</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-0">
              <input type="radio" name="scope" checked={scope === "all"} onChange={() => setScope("all")} className="size-4 accent-[var(--brand)]" />
              All facilities (including new ones)
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-0">
              <input
                type="radio"
                name="scope"
                checked={scope === "specific"}
                onChange={() => setScope("specific")}
                className="size-4 accent-[var(--brand)]"
              />
              Specific facilities
            </label>
          </div>
          {scope === "specific" && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-1">
              {facilities.length === 0 ? (
                <p className="p-2 text-sm text-muted-foreground">This organization has no facilities yet.</p>
              ) : (
                facilities.map((f) => (
                  <label
                    key={f.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(f.id)}
                      onChange={() => toggle(f.id)}
                      className="size-4 accent-[var(--brand)]"
                    />
                    {f.name}
                  </label>
                ))
              )}
            </div>
          )}
          {scope === "specific" && (
            <span className="text-xs text-muted-foreground">
              {selected.length} of {facilities.length} selected
            </span>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md border border-input px-4 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45"
          >
            {isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
