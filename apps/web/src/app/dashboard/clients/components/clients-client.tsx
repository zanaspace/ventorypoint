"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Users, Mail, Phone, Building2, X, Trash2, Edit2, PauseCircle, PlayCircle } from "lucide-react";
import { createClientAccount, deleteClientAccount, updateClientAccount, setClientStatus } from "../actions";
import { toast } from "sonner";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { TablePagination } from "@/components/ui/table-pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Modal } from "@/components/ui/modal";

type ClientAccount = {
  id: string;
  name: string;
  short_code: string;
  status: 'active' | 'suspended';
  primary_contact_email: string | null;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  default_facility_id: string | null;
  facility_ids: string[];
  organization_id: string;
};

type Org = {
  id: string;
  name: string;
};

type Facility = {
  id: string;
  name: string;
  organization_id: string;
};

export function ClientsClient({ 
  initialClients, 
  organizations,
  facilities
}: { 
  initialClients: ClientAccount[];
  organizations: Org[];
  facilities: Facility[];
}) {
  const [clients, setClients] = useState<ClientAccount[]>(initialClients);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientAccount | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const filteredClients = useMemo(() => {
    return clients.filter(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.short_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.primary_contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.primary_contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [clients, searchQuery]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = filteredClients.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Form states for auto-generating short code
  const [formName, setFormName] = useState("");
  const [formShortCode, setFormShortCode] = useState("");
  const [isShortCodeEdited, setIsShortCodeEdited] = useState(false);

  const defaultOrgId = organizations.length === 1 ? organizations[0].id : "";

  // Facility assignment form state
  const [formOrgId, setFormOrgId] = useState(defaultOrgId);
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<string[]>([]);
  const [defaultFacilityId, setDefaultFacilityId] = useState("");

  const orgFacilities = facilities.filter(f => f.organization_id === formOrgId);
  const facilityName = (id: string) => facilities.find(f => f.id === id)?.name ?? "";

  function toggleFacility(id: string) {
    setSelectedFacilityIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      // Unchecking the default facility clears the default
      if (!next.includes(defaultFacilityId)) setDefaultFacilityId("");
      return next;
    });
  }

  function openEditModal(client: ClientAccount) {
    setEditingClient(client);
    setFormName(client.name);
    setFormShortCode(client.short_code);
    setIsShortCodeEdited(true);
    setFormOrgId(client.organization_id);
    setSelectedFacilityIds(client.facility_ids ?? []);
    setDefaultFacilityId(client.default_facility_id ?? "");
    setIsModalOpen(true);
  }

  function openCreateModal() {
    setEditingClient(null);
    setFormName("");
    setFormShortCode("");
    setIsShortCodeEdited(false);
    setFormOrgId(defaultOrgId);
    setSelectedFacilityIds([]);
    setDefaultFacilityId("");
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setTimeout(() => {
      setEditingClient(null);
      setFormName("");
      setFormShortCode("");
      setIsShortCodeEdited(false);
      setSelectedFacilityIds([]);
      setDefaultFacilityId("");
    }, 200);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setFormName(val);
    
    if (!isShortCodeEdited) {
      const words = val.trim().split(/\s+/);
      let gen = "";
      if (val.trim().length === 0) {
        gen = "";
      } else if (words.length >= 2) {
        gen = words.slice(0, 3).map(w => w[0]).join("").toUpperCase();
      } else {
        gen = val.slice(0, 3).toUpperCase();
      }
      setFormShortCode(gen);
    }
  }

  function handleShortCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormShortCode(e.target.value.toUpperCase());
    setIsShortCodeEdited(true);
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    
    let res;
    if (editingClient) {
      res = await updateClientAccount(editingClient.id, formData);
    } else {
      res = await createClientAccount(formData);
    }
    
    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      if (editingClient) {
        toast.success("Client account updated successfully");
        setClients(clients.map(c => c.id === res.data.id ? res.data : c));
      } else {
        toast.success("Client account created successfully");
        setClients([...clients, res.data]);
      }
      handleCloseModal();
    }
    
    setIsSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this client account?")) return;
    
    const res = await deleteClientAccount(id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Client account deleted");
      setClients(clients.filter(c => c.id !== id));
    }
  }

  async function handleToggleStatus(client: ClientAccount) {
    const next = client.status === 'active' ? 'suspended' : 'active';
    const res = await setClientStatus(client.id, next);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success(next === 'suspended' ? "Client suspended" : "Client reactivated");
      setClients(clients.map(c => c.id === client.id ? { ...c, status: next } : c));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Client Accounts</h1>
          <p className="text-muted-foreground mt-1">Manage the brands and merchants your 3PL serves.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex w-full sm:w-auto items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-medium hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Add Client
        </button>
      </div>

      {/* Main Content Card */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50/50 dark:bg-white/5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search clients..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-4 py-2 w-full text-sm bg-white dark:bg-black/20 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="responsive-table w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-gray-50/50 dark:bg-white/5 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Client Name</th>
                <th className="px-6 py-4 font-semibold">Code</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Facilities</th>
                <th className="px-6 py-4 font-semibold">Primary Contact</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedClients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building2 className="w-8 h-8 text-gray-300" />
                      <p>No client accounts found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedClients.map((client) => (
                  <tr key={client.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                    <td data-primary className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-brand-text font-bold text-lg">
                        {client.name.charAt(0).toUpperCase()}
                      </div>
                      {client.name}
                      </div>
                    </td>
                    <td data-label="Code" className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 rounded-md text-xs font-mono font-medium">
                        {client.short_code}
                      </span>
                    </td>
                    <td data-label="Status" className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        client.status === 'active' 
                          ? 'bg-success-soft text-success-text border border-success/25' 
                          : 'bg-warning-soft text-warning-text border border-warning/30'
                      }`}>
                        {client.status}
                      </span>
                    </td>
                    <td data-label="Facilities" className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {client.facility_ids?.length ? (
                        <span title={client.facility_ids.map(facilityName).join(", ")}>
                          {client.facility_ids.length} {client.facility_ids.length === 1 ? "facility" : "facilities"}
                          {client.default_facility_id && (
                            <span className="block text-xs text-muted-foreground">
                              Default: {facilityName(client.default_facility_id)}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">None assigned</span>
                      )}
                    </td>
                    <td data-label="Contact" className="px-6 py-4 text-gray-600 dark:text-gray-400">
                      {client.primary_contact_name ? (
                        <div className="flex flex-col">
                          <span className="font-medium">{client.primary_contact_name}</span>
                          <span className="text-xs text-muted-foreground">{client.primary_contact_email}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Not set</span>
                      )}
                    </td>
                    <td data-actions className="px-6 py-4 text-right">
                      <ActionDropdown 
                        actions={[
                          {
                            label: "Edit",
                            icon: <Edit2 className="w-4 h-4" />,
                            onClick: () => openEditModal(client)
                          },
                          {
                            label: client.status === 'active' ? "Suspend" : "Reactivate",
                            icon: client.status === 'active' ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />,
                            onClick: () => handleToggleStatus(client)
                          },
                          {
                            label: "Delete",
                            icon: <Trash2 className="w-4 h-4" />,
                            danger: true,
                            onClick: () => handleDelete(client.id)
                          }
                        ]}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {filteredClients.length > 0 && (
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

      {/* Modal */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        title={editingClient ? "Edit Client Account" : "Add Client Account"}
      >
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {organizations.length > 1 && !editingClient && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</label>
                  <SearchableSelect 
                    name="organization_id" 
                    required
                    value={formOrgId}
                    onChange={(val) => {
                      setFormOrgId(val);
                      setSelectedFacilityIds([]);
                      setDefaultFacilityId("");
                    }}
                    placeholder="Select Organization..."
                    options={organizations.map(org => ({ label: org.name, value: org.id }))}
                  />
                </div>
              )}
              {organizations.length === 1 && !editingClient && (
                <input type="hidden" name="organization_id" value={defaultOrgId} />
              )}
              {editingClient && (
                <input type="hidden" name="organization_id" value={editingClient.organization_id} />
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client Brand Name</label>
                <input 
                  type="text" 
                  name="name" 
                  required
                  value={formName}
                  onChange={handleNameChange}
                  placeholder="e.g. Acme Shoes"
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Short Code (Prefix)</label>
                <input 
                  type="text" 
                  name="short_code" 
                  required
                  value={formShortCode}
                  onChange={handleShortCodeChange}
                  placeholder="e.g. ACM"
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">Used as a prefix for orders and inventory (e.g., ACM-1004).</p>
              </div>

              <div className="pt-2 border-t border-border mt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Serving Facilities</h3>
                {orgFacilities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {formOrgId ? "No facilities yet. Create a facility first to assign it." : "Select an organization to see its facilities."}
                  </p>
                ) : (
                  <>
                    <div className="max-h-36 overflow-y-auto border border-border rounded-md p-2 space-y-1">
                      {orgFacilities.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 text-sm px-1 py-0.5 cursor-pointer">
                          <input
                            type="checkbox"
                            name="facility_ids"
                            value={f.id}
                            checked={selectedFacilityIds.includes(f.id)}
                            onChange={() => toggleFacility(f.id)}
                          />
                          {f.name}
                        </label>
                      ))}
                    </div>
                    {selectedFacilityIds.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Facility</label>
                        <SearchableSelect
                          name="default_facility_id"
                          value={defaultFacilityId}
                          onChange={setDefaultFacilityId}
                          placeholder="No default"
                          options={[
                            { label: "No default", value: "" },
                            ...orgFacilities
                              .filter((f) => selectedFacilityIds.includes(f.id))
                              .map((f) => ({ label: f.name, value: f.id })),
                          ]}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="pt-2 border-t border-border mt-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Primary Contact (Optional)</h3>
                
                <div className="space-y-3">
                  <div className="relative">
                    <Users className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="text" 
                      name="primary_contact_name" 
                      defaultValue={editingClient?.primary_contact_name || ""}
                      placeholder="Contact Name"
                      className="w-full pl-9 pr-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                    />
                  </div>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="email" 
                      name="primary_contact_email" 
                      defaultValue={editingClient?.primary_contact_email || ""}
                      placeholder="Contact Email"
                      className="w-full pl-9 pr-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                    />
                  </div>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input 
                      type="tel" 
                      name="primary_contact_phone" 
                      defaultValue={editingClient?.primary_contact_phone || ""}
                      placeholder="Contact Phone"
                      className="w-full pl-9 pr-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-border mt-6">
                <button 
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (editingClient ? "Saving..." : "Adding...") : (editingClient ? "Save Changes" : "Add Client")}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
