"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Copy, Check, Trash2, Shield, ShieldOff, ShieldCheck, Link as LinkIcon, Ban, MoreVertical, UserCheck, QrCode, KeyRound, UserPlus, Pencil } from "lucide-react";
import { removeMember, toggleMemberStatus, generateInviteCode, setAdminPrivilege, revokeInvite } from "../actions";
import { createFloorWorkerAction, reissueFloorBadgeAction, updateFloorWorkerPinAction } from "../floor-actions";
import { BadgeModal } from "./badge-modal";
import { EditMemberModal } from "./edit-member-modal";
import { toast } from "sonner";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { TablePagination } from "@/components/ui/table-pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Modal } from "@/components/ui/modal";

type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type FloorWorkerCredential = {
  worker_code: string;
  badge_token: string;
  failed_attempts: number;
  locked_until: string | null;
};

type Member = {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  is_active: boolean;
  pending_approval: boolean;
  can_manage_all_members: boolean;
  all_facilities: boolean;
  added_by: string | null;
  profiles: Profile | null;
  inviter: Omit<Profile, "id"> | null;
  credential?: FloorWorkerCredential | null;
  facility_names: string[] | null;
  facility_ids: string[];
};

type Invitation = {
  id: string;
  organization_id: string;
  token: string;
  code_hint: string | null;
  role: string;
  expires_at: string | null;
  uses: number;
  max_uses: number | null;
  status: string;
  domain_restriction: string | null;
  requires_approval: boolean;
  all_facilities: boolean;
};

type Org = { id: string; name: string };
type Facility = { id: string; name: string; organization_id: string };
type Rights = Record<string, { role: string; canManageAll: boolean }>;

const roleLabel = (r: string) => r.replace("_", " ");

export function MembersClient({
  currentUserId,
  myRights,
  initialMembers,
  initialInvites,
  organizations,
  facilities,
}: {
  currentUserId: string;
  myRights: Rights;
  initialMembers: Member[];
  initialInvites: Invitation[];
  organizations: Org[];
  facilities: Facility[];
}) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [invites, setInvites] = useState<Invitation[]>(initialInvites);
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFloorWorkerModalOpen, setIsFloorWorkerModalOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [selectedMemberForPin, setSelectedMemberForPin] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [newPinValue, setNewPinValue] = useState("");
  const [activeBadgeModal, setActiveBadgeModal] = useState<{
    worker_code: string;
    first_name: string;
    last_name?: string;
    badge_token: string;
    org_name?: string;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [createdInvite, setCreatedInvite] = useState<{ code: string; token: string } | null>(null);

  // Invite & Floor Worker form state
  const defaultOrgId = organizations.length === 1 ? organizations[0].id : "";
  const [formOrgId, setFormOrgId] = useState(defaultOrgId);
  const [formRole, setFormRole] = useState("floor_worker");
  const [facilityScope, setFacilityScope] = useState<"all" | "specific">("all");
  const [unlimited, setUnlimited] = useState(false);

  // Pagination & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.profiles?.first_name?.toLowerCase().includes(q) ||
        m.profiles?.last_name?.toLowerCase().includes(q) ||
        m.profiles?.email?.toLowerCase().includes(q) ||
        m.credential?.worker_code?.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const totalPages = Math.ceil(filteredMembers.length / itemsPerPage);
  const paginatedMembers = filteredMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeInvites = invites.filter(
    (i) =>
      i.status === "pending" &&
      (!i.expires_at || new Date(i.expires_at) > new Date()) &&
      (i.max_uses === null || i.uses < i.max_uses)
  );

  const callerRoleInForm = formOrgId ? myRights[formOrgId]?.role : undefined;
  const roleOptions = [
    ...(callerRoleInForm === "owner" ? [{ label: "Admin", value: "admin" }] : []),
    { label: "Ops Manager", value: "ops_manager" },
    { label: "Supervisor", value: "supervisor" },
    { label: "Floor Worker", value: "floor_worker" },
    { label: "Billing", value: "billing" },
  ];
  const orgFacilities = facilities.filter((f) => f.organization_id === formOrgId);

  // Checks caller rights
  function canManage(member: Member) {
    if (member.user_id === currentUserId) return false;
    const mine = myRights[member.organization_id];
    if (!mine) return false;
    if (mine.role === "owner") return true;
    if (mine.role === "admin") {
      return (
        !["owner", "admin"].includes(member.role) &&
        (mine.canManageAll || member.added_by === currentUserId)
      );
    }
    if (mine.role === "ops_manager") {
      return member.role === "floor_worker";
    }
    return false;
  }

  function resetForm() {
    setFormOrgId(defaultOrgId);
    setFormRole("floor_worker");
    setFacilityScope("all");
    setUnlimited(false);
  }

  async function handleToggleStatus(member: Member) {
    const next = !member.is_active;
    const res = await toggleMemberStatus(member.id, next);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(
        member.pending_approval ? "Member approved" : `Member access ${next ? "restored" : "revoked"}`
      );
      setMembers(
        members.map((m) =>
          m.id === member.id ? { ...m, is_active: next, pending_approval: false } : m
        )
      );
    }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Are you sure you want to permanently remove this member?")) return;

    const res = await removeMember(memberId);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Member removed");
      setMembers(members.filter((m) => m.id !== memberId));
    }
  }

  async function handleAdminPrivilege(member: Member) {
    const next = !member.can_manage_all_members;
    const res = await setAdminPrivilege(member.id, next);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(next ? "Admin can now manage all members" : "Admin limited to members they invited");
      setMembers(members.map((m) => (m.id === member.id ? { ...m, can_manage_all_members: next } : m)));
    }
  }

  async function handleGenerateInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const res = await generateInviteCode(formData);

    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      toast.success("Invite code generated!");
      const days = parseInt(formData.get("days_valid") as string) || 7;
      const max = formData.get("unlimited_uses") === "on" ? null : parseInt(formData.get("max_uses") as string) || 1;
      setInvites([
        {
          id: res.data.id,
          organization_id: formData.get("organization_id") as string,
          token: res.data.token,
          code_hint: res.data.code.slice(-4),
          role: formData.get("role") as string,
          expires_at: new Date(Date.now() + days * 86400000).toISOString(),
          uses: 0,
          max_uses: max,
          status: "pending",
          domain_restriction: ((formData.get("domain_restriction") as string) || "").trim().replace(/^@/, "") || null,
          requires_approval: formData.get("requires_approval") === "on",
          all_facilities: formData.get("facility_scope") !== "specific",
        },
        ...invites,
      ]);
      setCreatedInvite({ code: res.data.code, token: res.data.token });
      setIsModalOpen(false);
      resetForm();
    }

    setIsSubmitting(false);
  }

  async function handleCreateFloorWorker(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const res = await createFloorWorkerAction(formData);

    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      toast.success("Floor worker created successfully!");
      const org = organizations.find((o) => o.id === (formData.get("organization_id") as string));
      
      const newMember: Member = {
        id: res.data.member_id,
        user_id: res.data.member_id,
        organization_id: formData.get("organization_id") as string,
        role: "floor_worker",
        is_active: true,
        pending_approval: false,
        can_manage_all_members: false,
        all_facilities: formData.get("facility_scope") !== "specific",
        added_by: currentUserId,
        profiles: {
          id: res.data.member_id,
          first_name: res.data.first_name,
          last_name: res.data.last_name,
          email: null,
        },
        inviter: null,
        credential: {
          worker_code: res.data.worker_code,
          badge_token: res.data.badge_token,
          failed_attempts: 0,
          locked_until: null,
        },
        facility_ids: formData.get("facility_scope") === "specific" ? (formData.getAll("facility_ids") as string[]) : [],
        facility_names:
          formData.get("facility_scope") === "specific"
            ? facilities.filter((f) => formData.getAll("facility_ids").includes(f.id)).map((f) => f.name)
            : null,
      };

      setMembers([newMember, ...members]);
      setIsFloorWorkerModalOpen(false);
      resetForm();

      // Show printable badge card modal
      setActiveBadgeModal({
        worker_code: res.data.worker_code,
        first_name: res.data.first_name,
        last_name: res.data.last_name,
        badge_token: res.data.badge_token,
        org_name: org?.name,
      });
    }

    setIsSubmitting(false);
  }

  async function handleReissueBadge(member: Member) {
    if (!confirm(`Reissue badge for ${member.profiles?.first_name}? The previous badge will stop working immediately.`)) return;

    const res = await reissueFloorBadgeAction(member.id);
    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      toast.success("Badge reissued successfully!");
      setMembers(
        members.map((m) =>
          m.id === member.id
            ? {
                ...m,
                credential: {
                  worker_code: res.data.worker_code,
                  badge_token: res.data.badge_token,
                  failed_attempts: 0,
                  locked_until: null,
                },
              }
            : m
        )
      );

      const org = organizations.find((o) => o.id === member.organization_id);
      setActiveBadgeModal({
        worker_code: res.data.worker_code,
        first_name: member.profiles?.first_name || "Floor Worker",
        last_name: member.profiles?.last_name || "",
        badge_token: res.data.badge_token,
        org_name: org?.name,
      });
    }
  }

  async function handleUpdatePin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMemberForPin) return;

    setIsSubmitting(true);
    const res = await updateFloorWorkerPinAction(selectedMemberForPin.id, newPinValue);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("PIN updated and account unlocked!");
      setIsPinModalOpen(false);
      setSelectedMemberForPin(null);
      setNewPinValue("");
      setMembers(
        members.map((m) =>
          m.id === selectedMemberForPin.id && m.credential
            ? { ...m, credential: { ...m.credential, failed_attempts: 0, locked_until: null } }
            : m
        )
      );
    }
    setIsSubmitting(false);
  }

  async function handleRevokeInvite(id: string) {
    if (!confirm("Revoke this invitation? The code and link will stop working immediately.")) return;
    const res = await revokeInvite(id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Invitation revoked");
      setInvites(invites.map((i) => (i.id === id ? { ...i, status: "revoked" } : i)));
    }
  }

  function copy(text: string, key: string, message: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    toast.success(message);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const inviteLink = (token: string) => `${window.location.origin}/invite?token=${token}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Team Members</h1>
          <p className="text-muted-foreground mt-1">Manage staff access, floor workers, and invite codes.</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto sm:items-center">
          <button
            onClick={() => {
              resetForm();
              setIsFloorWorkerModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 border border-border bg-background hover:bg-gray-50 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 px-3.5 py-2.5 rounded-lg font-medium transition-colors shadow-xs cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-brand-text" />
            Add Floor Worker
          </button>
          <button
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            Invite Member
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Content Card (Members Table) */}
        <div className="xl:col-span-2 bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gray-50/50 dark:bg-white/5">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Active Directory</h2>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search team..."
                name="team-search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-4 py-2 w-full text-sm bg-white dark:bg-black/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="responsive-table w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-gray-50/50 dark:bg-white/5 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Facilities</th>
                  <th className="px-6 py-4 font-semibold">Invited by</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No members found.
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((member) => {
                    const manageable = canManage(member);
                    const isSelf = member.user_id === currentUserId;
                    const myRole = myRights[member.organization_id]?.role;
                    const isFloorWorker = member.role === "floor_worker";
                    const org = organizations.find((o) => o.id === member.organization_id);

                    const actions = [
                      ...(isFloorWorker && member.credential
                        ? [
                            {
                              label: "View Badge Card",
                              icon: <QrCode className="w-4 h-4 text-brand-text" />,
                              onClick: () =>
                                setActiveBadgeModal({
                                  worker_code: member.credential!.worker_code,
                                  first_name: member.profiles?.first_name || "Floor Worker",
                                  last_name: member.profiles?.last_name || "",
                                  badge_token: member.credential!.badge_token,
                                  org_name: org?.name,
                                }),
                            },
                          ]
                        : []),
                      ...(manageable && member.role !== "owner"
                        ? [
                            {
                              label: "Edit role & facilities",
                              icon: <Pencil className="w-4 h-4" />,
                              onClick: () => setEditingMember(member),
                            },
                          ]
                        : []),
                      ...(manageable && isFloorWorker
                        ? [
                            {
                              label: "Change / Reset PIN",
                              icon: <KeyRound className="w-4 h-4" />,
                              onClick: () => {
                                setSelectedMemberForPin(member);
                                setNewPinValue("");
                                setIsPinModalOpen(true);
                              },
                            },
                            {
                              label: "Reissue Badge",
                              icon: <QrCode className="w-4 h-4" />,
                              onClick: () => handleReissueBadge(member),
                            },
                          ]
                        : []),
                      ...(manageable
                        ? [
                            {
                              label: member.pending_approval
                                ? "Approve"
                                : member.is_active
                                ? "Revoke Access"
                                : "Restore Access",
                              icon: member.pending_approval ? (
                                <UserCheck className="w-4 h-4" />
                              ) : member.is_active ? (
                                <ShieldOff className="w-4 h-4" />
                              ) : (
                                <Shield className="w-4 h-4" />
                              ),
                              onClick: () => handleToggleStatus(member),
                            },
                          ]
                        : []),
                      ...(myRole === "owner" && member.role === "admin"
                        ? [
                            {
                              label: member.can_manage_all_members
                                ? "Limit to own invites"
                                : "Allow managing all members",
                              icon: <ShieldCheck className="w-4 h-4" />,
                              onClick: () => handleAdminPrivilege(member),
                            },
                          ]
                        : []),
                      ...(manageable
                        ? [
                            {
                              label: "Remove Member",
                              icon: <Trash2 className="w-4 h-4" />,
                              danger: true,
                              onClick: () => handleRemove(member.id),
                            },
                          ]
                        : []),
                    ];

                    return (
                      <tr key={member.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                        <td data-primary className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center font-bold shrink-0">
                              {(member.profiles?.first_name || member.profiles?.email || member.credential?.worker_code || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                {member.profiles?.first_name} {member.profiles?.last_name}
                                {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                                {member.credential?.worker_code && (
                                  <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-accent text-brand-text font-semibold">
                                    {member.credential.worker_code}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {member.profiles?.email || "Badge + PIN Access"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Role" className="px-6 py-4">
                          <span className="capitalize text-gray-700 dark:text-gray-300 font-medium">
                            {roleLabel(member.role)}
                          </span>
                          {member.role === "admin" && member.can_manage_all_members && (
                            <span className="block text-[11px] text-muted-foreground">Manages all members</span>
                          )}
                        </td>
                        <td data-label="Facilities" className="px-6 py-4 text-gray-600 dark:text-gray-400 md:max-w-[180px]">
                          {member.all_facilities ? (
                            "All facilities"
                          ) : member.facility_names && member.facility_names.length > 0 ? (
                            <span className="truncate block" title={member.facility_names.join(", ")}>
                              {member.facility_names.join(", ")}
                            </span>
                          ) : (
                            <span className="italic text-gray-400">None</span>
                          )}
                        </td>
                        <td data-label="Invited by" className="px-6 py-4 text-gray-600 dark:text-gray-400">
                          {member.inviter
                            ? `${member.inviter.first_name ?? ""} ${member.inviter.last_name ?? ""}`.trim() ||
                              member.inviter.email
                            : "—"}
                        </td>
                        <td data-label="Status" className="px-6 py-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                              member.pending_approval
                                ? "bg-warning-soft text-warning-text border border-warning/30"
                                : member.is_active
                                ? "bg-success-soft text-success-text border border-success/25"
                                : "bg-danger-soft text-danger-text border border-destructive/25"
                            }`}
                          >
                            {member.pending_approval ? "Pending approval" : member.is_active ? "Active" : "Revoked"}
                          </span>
                        </td>
                        <td data-actions className="px-6 py-4 text-right">
                          {actions.length > 0 ? (
                            <ActionDropdown actions={actions} />
                          ) : (
                            <button
                              disabled
                              title={
                                isSelf
                                  ? "You can't change your own access"
                                  : "You can only manage members you invited"
                              }
                              className="p-1.5 text-gray-300 dark:text-gray-600 rounded-md inline-flex cursor-not-allowed"
                              aria-label="No actions available"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {filteredMembers.length > 0 && (
            <div className="p-4 border-t border-border">
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(items) => {
                  setItemsPerPage(items);
                  setCurrentPage(1);
                }}
              />
            </div>
          )}
        </div>

        {/* Sidebar Card (Active Invites) */}
        <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col h-fit">
          <div className="p-4 border-b border-border bg-gray-50/50 dark:bg-white/5">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Active Invite Codes</h2>
          </div>
          <div className="p-4 flex flex-col gap-4">
            {activeInvites.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
                No active invite codes.
              </div>
            ) : (
              activeInvites.map((invite) => (
                <div key={invite.id} className="p-3 border border-border rounded-lg bg-surface flex flex-col gap-2">
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <div className="font-mono font-bold text-brand-text tracking-widest text-lg break-all">
                        ••••-{invite.code_hint ?? "????"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">Full code is shown only once, when created</div>
                    </div>
                    <div className="flex items-center">
                      <button
                        onClick={() => copy(inviteLink(invite.token), `link-${invite.id}`, "Invite link copied!")}
                        className="text-gray-400 hover:text-brand-text transition-colors cursor-pointer p-1"
                        title="Copy invite link"
                      >
                        {copiedKey === `link-${invite.id}` ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <LinkIcon className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="text-gray-400 hover:text-destructive transition-colors cursor-pointer p-1"
                        title="Revoke invitation"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                    <span className="capitalize bg-accent text-brand-text px-2 py-0.5 rounded-md font-medium">
                      {roleLabel(invite.role)}
                    </span>
                    <span>
                      {invite.uses} / {invite.max_uses ?? "∞"} uses
                    </span>
                  </div>
                  {(invite.domain_restriction || invite.requires_approval || !invite.all_facilities) && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {invite.domain_restriction && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10">@{invite.domain_restriction}</span>
                      )}
                      {invite.requires_approval && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10">Needs approval</span>
                      )}
                      {!invite.all_facilities && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/10">Facility-scoped</span>
                      )}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    Expires: {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString() : "never"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Floor Worker Creation Modal */}
      <Modal
        isOpen={isFloorWorkerModalOpen}
        onClose={() => setIsFloorWorkerModalOpen(false)}
        title="Add Floor Worker"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateFloorWorker} className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Creates a floor worker account without an email address. The worker will sign in at floor terminals using a scannable badge card and a numeric PIN.
          </p>

          {organizations.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</label>
              <SearchableSelect
                name="organization_id"
                required
                value={formOrgId}
                onChange={setFormOrgId}
                placeholder="Select Organization..."
                options={organizations.map((org) => ({ label: org.name, value: org.id }))}
              />
            </div>
          )}
          {organizations.length === 1 && <input type="hidden" name="organization_id" value={defaultOrgId} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">First Name</label>
              <input
                type="text"
                name="first_name"
                required
                placeholder="e.g. John"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Name</label>
              <input
                type="text"
                name="last_name"
                placeholder="e.g. Smith"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">4 to 6 Digit PIN</label>
            <input
              type="password"
              name="pin"
              required
              minLength={4}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="••••"
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm font-mono tracking-widest"
            />
            <p className="text-[11px] text-muted-foreground">The worker will enter this PIN after scanning their badge.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Facility Access</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="facility_scope"
                  value="all"
                  checked={facilityScope === "all"}
                  onChange={() => setFacilityScope("all")}
                />
                All facilities
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="facility_scope"
                  value="specific"
                  checked={facilityScope === "specific"}
                  onChange={() => setFacilityScope("specific")}
                />
                Specific facilities
              </label>
            </div>
            {facilityScope === "specific" && (
              <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                {orgFacilities.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-1">
                    {formOrgId ? "No facilities found." : "Select an organization first."}
                  </p>
                ) : (
                  orgFacilities.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
                      <input type="checkbox" name="facility_ids" value={f.id} />
                      {f.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-border mt-6">
            <button
              type="button"
              onClick={() => setIsFloorWorkerModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isSubmitting ? "Creating..." : "Create Worker & Badge"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset PIN Modal */}
      <Modal
        isOpen={isPinModalOpen}
        onClose={() => {
          setIsPinModalOpen(false);
          setSelectedMemberForPin(null);
        }}
        title="Change Worker PIN"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdatePin} className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Set a new 4 to 6 digit PIN for {selectedMemberForPin?.profiles?.first_name}. If the account was locked from failed attempts, updating the PIN will unlock it.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">New PIN</label>
            <input
              type="password"
              required
              minLength={4}
              maxLength={6}
              inputMode="numeric"
              pattern="[0-9]*"
              value={newPinValue}
              onChange={(e) => setNewPinValue(e.target.value)}
              placeholder="••••"
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand font-mono text-sm tracking-widest"
              autoFocus
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-border mt-6">
            <button
              type="button"
              onClick={() => {
                setIsPinModalOpen(false);
                setSelectedMemberForPin(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || newPinValue.length < 4}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Updating..." : "Update PIN"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Badge Modal */}
      <BadgeModal
        isOpen={!!activeBadgeModal}
        onClose={() => setActiveBadgeModal(null)}
        worker={activeBadgeModal}
      />

      {/* Standard Invite Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Generate Invite Code" maxWidth="max-w-lg">
        <form onSubmit={handleGenerateInvite} className="p-6 space-y-4">
          {organizations.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</label>
              <SearchableSelect
                name="organization_id"
                required
                value={formOrgId}
                onChange={setFormOrgId}
                placeholder="Select Organization..."
                options={organizations.map((org) => ({ label: org.name, value: org.id }))}
              />
            </div>
          )}
          {organizations.length === 1 && <input type="hidden" name="organization_id" value={defaultOrgId} />}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assign Role</label>
            <SearchableSelect
              name="role"
              required
              value={formRole}
              onChange={setFormRole}
              placeholder="Select Role..."
              options={roleOptions}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Facility access</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="facility_scope"
                  value="all"
                  checked={facilityScope === "all"}
                  onChange={() => setFacilityScope("all")}
                />
                All facilities
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="facility_scope"
                  value="specific"
                  checked={facilityScope === "specific"}
                  onChange={() => setFacilityScope("specific")}
                />
                Specific facilities
              </label>
            </div>
            {facilityScope === "specific" && (
              <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                {orgFacilities.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-1">
                    {formOrgId ? "No facilities yet. Create one first." : "Select an organization first."}
                  </p>
                ) : (
                  orgFacilities.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
                      <input type="checkbox" name="facility_ids" value={f.id} />
                      {f.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Max Uses</label>
              <input
                type="number"
                name="max_uses"
                min="1"
                defaultValue="1"
                disabled={unlimited}
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  name="unlimited_uses"
                  checked={unlimited}
                  onChange={(e) => setUnlimited(e.target.checked)}
                />
                Unlimited until expiry
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Days Valid</label>
              <input
                type="number"
                name="days_valid"
                required
                min="1"
                max="90"
                defaultValue="7"
                className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Restrict to email domain <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              name="domain_restriction"
              autoComplete="off"
              placeholder="e.g. partner3pl.com"
              className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" name="requires_approval" />
            Require admin approval before the member is activated
          </label>

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-border mt-6">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Generating..." : "Generate Code"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Created-invite modal: the only time the plaintext code is visible */}
      {editingMember && (
        <EditMemberModal
          member={{
            id: editingMember.id,
            role: editingMember.role,
            all_facilities: editingMember.all_facilities,
            facility_ids: editingMember.facility_ids ?? [],
            displayName:
              [editingMember.profiles?.first_name, editingMember.profiles?.last_name].filter(Boolean).join(" ") ||
              editingMember.profiles?.email ||
              editingMember.credential?.worker_code ||
              "this member",
          }}
          callerRole={myRights[editingMember.organization_id]?.role ?? ""}
          facilities={facilities.filter((f) => f.organization_id === editingMember.organization_id)}
          onClose={() => setEditingMember(null)}
          onSaved={(changes) => {
            setMembers((list) =>
              list.map((m) =>
                m.id === editingMember.id
                  ? {
                      ...m,
                      role: changes.role,
                      all_facilities: changes.all_facilities,
                      facility_ids: changes.facility_ids,
                      facility_names: changes.all_facilities
                        ? null
                        : facilities.filter((f) => changes.facility_ids.includes(f.id)).map((f) => f.name),
                      can_manage_all_members: changes.role === "admin" ? m.can_manage_all_members : false,
                    }
                  : m
              )
            );
            setEditingMember(null);
          }}
        />
      )}

      <Modal isOpen={!!createdInvite} onClose={() => setCreatedInvite(null)} title="Invite created">
        {createdInvite && (
          <div className="p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Copy this code now. For security only a hash is stored, so it can&apos;t be shown again.
            </p>
            <div className="flex items-center justify-between gap-3 p-4 rounded-lg border border-border bg-surface">
              <span className="font-mono font-bold text-brand-text tracking-widest text-xl sm:text-2xl break-all">{createdInvite.code}</span>
              <button
                onClick={() => copy(createdInvite.code, "created-code", "Invite code copied!")}
                className="p-2 rounded-md text-gray-500 hover:text-brand-text hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"
                title="Copy code"
              >
                {copiedKey === "created-code" ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <button
              onClick={() => copy(inviteLink(createdInvite.token), "created-link", "Invite link copied!")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-gray-50 dark:hover:bg-white/10 cursor-pointer"
            >
              {copiedKey === "created-link" ? <Check className="w-4 h-4 text-success" /> : <LinkIcon className="w-4 h-4" />}
              Copy shareable link instead
            </button>
            <div className="flex justify-end">
              <button
                onClick={() => setCreatedInvite(null)}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
