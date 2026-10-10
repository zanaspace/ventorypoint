"use client";

import { useState, useMemo } from "react";
import { Plus, Search, Building, MapPin, Clock, X, Trash2, Edit2, LocateFixed, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createFacility, deleteFacility, updateFacility, geocodeAddress, reverseGeocode } from "../actions";
import { toast } from "sonner";
import { ActionDropdown } from "@/components/ui/action-dropdown";
import { TablePagination } from "@/components/ui/table-pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Modal } from "@/components/ui/modal";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

type Hours = Record<string, { closed: boolean; open: string; close: string }>;
type Cutoff = { carrier: string; time: string };
type Geo = {
  city: string;
  state: string;
  zip_code: string;
  county: string;
  country: string;
  latitude: string;
  longitude: string;
  geocode_status: "verified" | "manual" | "unverified";
};

const emptyGeo: Geo = {
  city: "", state: "", zip_code: "", county: "", country: "",
  latitude: "", longitude: "", geocode_status: "unverified",
};

const defaultHours = (): Hours =>
  Object.fromEntries(
    DAYS.map((d) => [d.key, { closed: d.key === "sat" || d.key === "sun", open: "08:00", close: "17:00" }])
  );

type Facility = {
  id: string;
  name: string;
  short_code: string;
  timezone: string;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  county: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_status: "verified" | "manual" | "unverified" | null;
  operating_hours: Hours | null;
  carrier_cutoffs: Cutoff[] | null;
  organization_id: string;
  created_at: string;
};

type Org = {
  id: string;
  name: string;
};

export function FacilitiesClient({ 
  initialFacilities, 
  organizations 
}: { 
  initialFacilities: Facility[];
  organizations: Org[];
}) {
  const [facilities, setFacilities] = useState<Facility[]>(initialFacilities);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pagination & Filtering
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const filteredFacilities = useMemo(() => {
    return facilities.filter(f => 
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      f.short_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [facilities, searchQuery]);

  const totalPages = Math.ceil(filteredFacilities.length / itemsPerPage);
  const paginatedFacilities = filteredFacilities.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Form states for auto-generating short code
  const [formName, setFormName] = useState("");
  const [formShortCode, setFormShortCode] = useState("");
  const [isShortCodeEdited, setIsShortCodeEdited] = useState(false);

  // Structured address / geocoding / schedule state
  const [address, setAddress] = useState("");
  const [geo, setGeo] = useState<Geo>(emptyGeo);
  const [hours, setHours] = useState<Hours>(defaultHours());
  const [cutoffs, setCutoffs] = useState<Cutoff[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  function loadFormExtras(f: Facility | null) {
    setAddress(f?.address ?? "");
    setGeo(
      f
        ? {
            city: f.city ?? "",
            state: f.state ?? "",
            zip_code: f.zip_code ?? "",
            county: f.county ?? "",
            country: f.country ?? "",
            latitude: f.latitude?.toString() ?? "",
            longitude: f.longitude?.toString() ?? "",
            geocode_status: f.geocode_status ?? "unverified",
          }
        : emptyGeo
    );
    setHours(f?.operating_hours && Object.keys(f.operating_hours).length ? { ...defaultHours(), ...f.operating_hours } : defaultHours());
    setCutoffs(f?.carrier_cutoffs ?? []);
    setLocationNote(null);
  }

  async function handleVerifyAddress() {
    setLocationNote(null);
    setIsGeocoding(true);
    const res = await geocodeAddress({ street: address, city: geo.city, state: geo.state, zip: geo.zip_code });
    setIsGeocoding(false);
    if (!res.ok) {
      setGeo((g) => ({ ...g, geocode_status: "unverified" }));
      toast.error(res.error);
      return;
    }
    // Keep what the user typed; fill the gaps from the lookup.
    setGeo((g) => ({
      city: g.city || res.city || "",
      state: g.state || res.state || "",
      zip_code: g.zip_code || res.zip_code || "",
      county: g.county || res.county || "",
      country: res.country ?? g.country,
      latitude: res.latitude.toFixed(6),
      longitude: res.longitude.toFixed(6),
      geocode_status: res.precision === "exact" ? "verified" : "manual",
    }));
    if (res.precision === "exact") {
      toast.success("Address found. Confirm the pin on the map.");
    } else {
      setLocationNote("Only the area was found, not the exact street. Use your current location at the warehouse, or adjust the coordinates.");
      toast.warning("Found the area, not the exact address.");
    }
  }

  // Browser geolocation: the browser asks the user for permission on first use.
  function handleUseMyLocation() {
    setLocationNote(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("This browser can't share its location. Enter the coordinates manually.");
      return;
    }
    if (!window.isSecureContext) {
      toast.error("Location only works over HTTPS (or on localhost).");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setGeo((g) => ({ ...g, latitude: latitude.toFixed(6), longitude: longitude.toFixed(6), geocode_status: "manual" }));

        // Fill the address from the coordinates, without overwriting anything typed.
        const res = await reverseGeocode(latitude, longitude);
        setIsLocating(false);
        if (res.ok) {
          if (!address.trim() && res.street) setAddress(res.street);
          setGeo((g) => ({
            ...g,
            city: g.city || res.city || "",
            state: g.state || res.state || "",
            zip_code: g.zip_code || res.zip_code || "",
            county: g.county || res.county || "",
            country: g.country || res.country || "",
            geocode_status: accuracy <= 100 ? "verified" : "manual",
          }));
        }

        if (accuracy > 100) {
          setLocationNote(
            `Your browser placed you within about ${Math.round(accuracy)} m. Computers often estimate location from Wi-Fi; for a precise pin, do this on a phone at the warehouse or adjust the coordinates.`
          );
          toast.warning("Location found, but it may not be precise.");
        } else {
          toast.success(`Location found (±${Math.round(accuracy)} m). Confirm the pin on the map.`);
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationNote(
            "Location access is blocked for this site. Click the lock or site-settings icon in the address bar, allow Location, then try again."
          );
          toast.error("Location permission was denied.");
        } else if (err.code === err.TIMEOUT) {
          toast.error("Finding your location took too long. Try again, or enter coordinates manually.");
        } else {
          toast.error("Your location isn't available right now. Check that location services are on for this device.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const hasCoords = geo.latitude !== "" && geo.longitude !== "" && !isNaN(Number(geo.latitude)) && !isNaN(Number(geo.longitude));
  const mapSrc = hasCoords
    ? (() => {
        const lat = Number(geo.latitude);
        const lon = Number(geo.longitude);
        const d = 0.006;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${lon - d},${lat - d},${lon + d},${lat + d}&layer=mapnik&marker=${lat},${lon}`;
      })()
    : null;

  // If the user hand-edits coordinates, the pin is no longer "verified" by the geocoder
  function setCoord(key: "latitude" | "longitude", value: string) {
    setGeo((g) => ({ ...g, [key]: value, geocode_status: value === "" && (key === "latitude" ? g.longitude : g.latitude) === "" ? "unverified" : "manual" }));
  }

  // If the user only has one org, we can default to it
  const defaultOrgId = organizations.length === 1 ? organizations[0].id : "";

  function openEditModal(facility: Facility) {
    setEditingFacility(facility);
    setFormName(facility.name);
    setFormShortCode(facility.short_code);
    setIsShortCodeEdited(true);
    loadFormExtras(facility);
    setIsModalOpen(true);
  }

  function openCreateModal() {
    setEditingFacility(null);
    setFormName("");
    setFormShortCode("");
    setIsShortCodeEdited(false);
    loadFormExtras(null);
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setTimeout(() => {
      setEditingFacility(null);
      setFormName("");
      setFormShortCode("");
      setIsShortCodeEdited(false);
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
    if (editingFacility) {
      res = await updateFacility(editingFacility.id, formData);
    } else {
      res = await createFacility(formData);
    }
    
    if (res.error) {
      toast.error(res.error);
    } else if (res.data) {
      if (editingFacility) {
        toast.success("Facility updated successfully");
        setFacilities(facilities.map(f => f.id === res.data.id ? res.data : f));
      } else {
        toast.success("Facility created successfully");
        setFacilities([...facilities, res.data]);
      }
      handleCloseModal();
    }
    
    setIsSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this facility?")) return;
    
    const res = await deleteFacility(id);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Facility deleted");
      setFacilities(facilities.filter(f => f.id !== id));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Facilities</h1>
          <p className="text-muted-foreground mt-1">Manage your warehouses and fulfillment centers.</p>
        </div>
        <button 
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg font-medium hover:bg-primary-hover transition-colors shadow-sm cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Add Facility
        </button>
      </div>

      {/* Main Content Card (Table) */}
      <div className="bg-background border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50/50 dark:bg-white/5">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search facilities..." 
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
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-gray-50/50 dark:bg-white/5 border-b border-border">
              <tr>
                <th className="px-6 py-4 font-semibold">Facility Name</th>
                <th className="px-6 py-4 font-semibold">Short Code</th>
                <th className="px-6 py-4 font-semibold">Location</th>
                <th className="px-6 py-4 font-semibold">Timezone</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedFacilities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Building className="w-8 h-8 text-gray-300" />
                      <p>No facilities found.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedFacilities.map((facility) => (
                  <tr key={facility.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-brand-text">
                        <Building className="w-4 h-4" />
                      </div>
                      {facility.name}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-mono font-medium">
                        {facility.short_code}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="truncate max-w-[200px]">{facility.address || '—'}</span>
                          {(facility.city || facility.state || facility.zip_code) && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {[facility.city, facility.state].filter(Boolean).join(", ")} {facility.zip_code}
                            </span>
                          )}
                        </div>
                        {facility.latitude !== null && facility.geocode_status !== 'unverified' ? (
                          <span title={facility.geocode_status === 'verified' ? 'Address verified' : 'Pin set manually'}>
                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                          </span>
                        ) : facility.address ? (
                          <span title="Address not verified. Edit the facility and verify it.">
                            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {facility.timezone}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ActionDropdown 
                        actions={[
                          {
                            label: "Edit",
                            icon: <Edit2 className="w-4 h-4" />,
                            onClick: () => openEditModal(facility)
                          },
                          {
                            label: "Delete",
                            icon: <Trash2 className="w-4 h-4" />,
                            danger: true,
                            onClick: () => handleDelete(facility.id)
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
        {filteredFacilities.length > 0 && (
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
        title={editingFacility ? "Edit Facility" : "Add New Facility"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              {organizations.length > 1 && !editingFacility && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Organization</label>
                  <SearchableSelect 
                    name="organization_id" 
                    required
                    defaultValue={defaultOrgId}
                    placeholder="Select Organization..."
                    options={organizations.map(org => ({ label: org.name, value: org.id }))}
                  />
                </div>
              )}
              {organizations.length === 1 && !editingFacility && (
                <input type="hidden" name="organization_id" value={defaultOrgId} />
              )}
              {editingFacility && (
                <input type="hidden" name="organization_id" value={editingFacility.organization_id} />
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Facility Name</label>
                <input 
                  type="text" 
                  name="name" 
                  required
                  value={formName}
                  onChange={handleNameChange}
                  placeholder="e.g. West Coast Hub"
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Short Code</label>
                  <input 
                    type="text" 
                    name="short_code" 
                    required
                    value={formShortCode}
                    onChange={handleShortCodeChange}
                    placeholder="e.g. WCH"
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand font-mono uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Timezone</label>
                  <SearchableSelect 
                    name="timezone" 
                    required
                    defaultValue={editingFacility?.timezone || "America/Los_Angeles"}
                    options={[
                      { label: "Eastern (EST/EDT)", value: "America/New_York" },
                      { label: "Central (CST/CDT)", value: "America/Chicago" },
                      { label: "Mountain (MST/MDT)", value: "America/Denver" },
                      { label: "Pacific (PST/PDT)", value: "America/Los_Angeles" },
                      { label: "UTC", value: "UTC" },
                    ]}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Street address</label>
                <textarea 
                  name="address" 
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    // Editing the address invalidates any previous verification
                    setGeo((g) => (g.geocode_status === "verified" ? { ...g, geocode_status: "unverified" } : g));
                  }}
                  placeholder="Street, building number..."
                  rows={2}
                  className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">City</label>
                  <input name="city" value={geo.city} onChange={(e) => setGeo({ ...geo, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">State</label>
                  <input name="state" value={geo.state} onChange={(e) => setGeo({ ...geo, state: e.target.value })} className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">ZIP code</label>
                  <input name="zip_code" value={geo.zip_code} onChange={(e) => setGeo({ ...geo, zip_code: e.target.value })} className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">County</label>
                  <input name="county" value={geo.county} onChange={(e) => setGeo({ ...geo, county: e.target.value })} className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </div>
              <input type="hidden" name="country" value={geo.country} />
              <input type="hidden" name="geocode_status" value={geo.geocode_status} />

              {/* Geocoding + pin confirmation */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900 dark:text-gray-100">Location pin</div>
                    <div className="text-xs text-muted-foreground">
                      {geo.geocode_status === "verified"
                        ? "Address verified. Confirm the pin below."
                        : geo.geocode_status === "manual"
                        ? "Pin set manually."
                        : "Not verified yet."}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleVerifyAddress}
                      disabled={isGeocoding || isLocating}
                      className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:bg-brand hover:text-white disabled:opacity-45 cursor-pointer"
                    >
                      <Search className="w-4 h-4" />
                      {isGeocoding ? "Checking…" : "Verify address"}
                    </button>
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      disabled={isGeocoding || isLocating}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-45 cursor-pointer"
                    >
                      <LocateFixed className={`w-4 h-4 ${isLocating ? "animate-pulse" : ""}`} />
                      {isLocating ? "Locating…" : "Use my current location"}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Standing at the warehouse? Use your current location. Your browser will ask for permission first.
                </p>
                {locationNote && (
                  <p role="status" className="flex items-start gap-1.5 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-text">
                    <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                    {locationNote}
                  </p>
                )}

                {mapSrc && (
                  <iframe
                    title="Facility location"
                    src={mapSrc}
                    className="w-full h-48 rounded-md border border-border"
                    loading="lazy"
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Latitude</label>
                    <input name="latitude" inputMode="decimal" value={geo.latitude} onChange={(e) => setCoord("latitude", e.target.value)} placeholder="e.g. 34.052235" className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Longitude</label>
                    <input name="longitude" inputMode="decimal" value={geo.longitude} onChange={(e) => setCoord("longitude", e.target.value)} placeholder="e.g. -118.243683" className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand font-mono" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pin in the wrong spot? Adjust the coordinates and the map updates.
                </p>
                {geo.geocode_status === "unverified" && address.trim() && (
                  <p className="flex items-center gap-1.5 text-xs text-warning-text">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    This address is unverified and will be flagged until you verify it.
                  </p>
                )}
              </div>

              {/* Operating hours */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Operating hours</label>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {DAYS.map((d) => (
                    <div key={d.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="w-24 text-gray-700 dark:text-gray-300">{d.label}</span>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={hours[d.key].closed}
                          onChange={(e) => setHours({ ...hours, [d.key]: { ...hours[d.key], closed: e.target.checked } })}
                        />
                        Closed
                      </label>
                      <input
                        type="time"
                        value={hours[d.key].open}
                        disabled={hours[d.key].closed}
                        onChange={(e) => setHours({ ...hours, [d.key]: { ...hours[d.key], open: e.target.value } })}
                        className="ml-auto px-2 py-1 border border-border rounded-md disabled:opacity-40"
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="time"
                        value={hours[d.key].close}
                        disabled={hours[d.key].closed}
                        onChange={(e) => setHours({ ...hours, [d.key]: { ...hours[d.key], close: e.target.value } })}
                        className="px-2 py-1 border border-border rounded-md disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
                <input type="hidden" name="operating_hours" value={JSON.stringify(hours)} />
              </div>

              {/* Carrier cutoffs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Carrier cutoff times</label>
                  <button
                    type="button"
                    onClick={() => setCutoffs([...cutoffs, { carrier: "", time: "16:00" }])}
                    className="flex items-center gap-1 text-xs font-medium text-brand-text hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add cutoff
                  </button>
                </div>
                {cutoffs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No cutoffs yet. e.g. UPS Ground at 16:00 local time.</p>
                ) : (
                  <div className="space-y-2">
                    {cutoffs.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={c.carrier}
                          onChange={(e) => setCutoffs(cutoffs.map((x, j) => (j === i ? { ...x, carrier: e.target.value } : x)))}
                          placeholder="Carrier (e.g. UPS Ground)"
                          className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                        <input
                          type="time"
                          value={c.time}
                          onChange={(e) => setCutoffs(cutoffs.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))}
                          className="px-2 py-2 text-sm border border-border rounded-md"
                        />
                        <button
                          type="button"
                          onClick={() => setCutoffs(cutoffs.filter((_, j) => j !== i))}
                          className="p-2 text-gray-400 hover:text-destructive cursor-pointer"
                          title="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input type="hidden" name="carrier_cutoffs" value={JSON.stringify(cutoffs)} />
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
                  {isSubmitting ? (editingFacility ? "Saving..." : "Creating...") : (editingFacility ? "Save Changes" : "Create Facility")}
                </button>
              </div>
            </form>
      </Modal>
    </div>
  );
}
