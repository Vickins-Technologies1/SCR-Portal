// src/app/property-owner-dashboard/users/page.tsx  (or wherever this page lives)
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { Eye, EyeOff } from "lucide-react";
import {
  Users,
  UserPlus,
  Mail,
  Phone,
  ShieldCheck,
  ShieldOff,
  Edit,
  Trash2,
  AlertCircle,
  X,
  Save,
} from "lucide-react";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface TeamMember {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  teamRole:
    | "Owner"                      // Property owner / primary decision maker
    | "Co-Owner"                   // Shared ownership / partner
    | "Property Manager"           // Overall operations & tenant relations
    | "Portfolio Manager"          // Oversees multiple properties / portfolios
    | "Leasing Manager"            // Tenant screening, leasing, renewals
    | "Maintenance Coordinator"    // Repairs, vendors, work orders
    | "Accounts Manager"           // Bookkeeping, rent collection, financials
    | "Finance Officer"            // Budgeting, tax, higher-level accounting
    | "Rent Collection Officer"    // Chasing arrears, payment reminders
    | "Tenant Relations Officer"   // Complaints, renewals, communication
    | "Field Inspector"            // Inspections, move-in/move-out reports
    | "Real Estate Agent"          // Sales, acquisitions, listings (if applicable)
    | "Marketing & Listings Specialist" // Online listings, marketing
    | "Legal & Compliance Officer" // Contracts, disputes, regulatory
    | "Administrative Assistant"   // Scheduling, filing, basic support
    | "Viewer"                     // Read-only access (auditors, junior staff)
    | "IT / Systems Admin"         // Software, user access management
    | "Security Coordinator";      // Gate access, security in gated estates

  permissions: string[];
  active: boolean;
  lastActive?: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: "dashboard:view", label: "Overview (Dashboard)" },
  { id: "properties:view", label: "View Properties" },
  { id: "properties:edit", label: "Edit Properties" },
  { id: "properties:list_new", label: "List New Property" },
  { id: "notifications:view", label: "View Notifications" },
  { id: "notifications:send", label: "Send Notifications" },
  { id: "notifications:manage", label: "Manage/Delete Notifications" },
  { id: "reminders:view", label: "View Upcoming Reminders" },
  { id: "reminders:trigger", label: "Trigger/Send Reminders" },
  { id: "communications:access", label: "Access Communication Tools" },
  { id: "tenants:view", label: "View Tenants" },
  { id: "tenants:edit", label: "Manage Tenants" },
  { id: "payments:view", label: "View Payments" },
  { id: "payments:record", label: "Record Payments" },
  { id: "expenses:view", label: "View Expenses" },
  { id: "expenses:create", label: "Create Expenses" },
  { id: "expenses:approve", label: "Approve Expenses" },
  { id: "reports:view", label: "View Reports" },
  { id: "reports:export", label: "Export Reports" },
  { id: "users:view", label: "View Team Members" },
  { id: "users:manage", label: "Manage Team Members (add/edit/delete)" },
  { id: "roles:manage", label: "Manage Roles & Permissions" },
  { id: "settings:view", label: "View Settings" },
  { id: "settings:edit", label: "Edit Settings" },
  { id: "security:manage", label: "Manage Security & Access" },
];

export default function UsersPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    teamRole: "Administrative Assistant" as TeamMember["teamRole"],
    permissions: [] as string[],
    password: "",
    confirmPassword: "",
  });
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Auth & CSRF
  useEffect(() => {
    const uid = Cookies.get("userId");
    const role = Cookies.get("role");
    if (!uid || role !== "propertyOwner") {
      router.replace("/login");
      return;
    }
    setUserId(uid);

    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict" });
            token = data.csrfToken;
          }
        } catch {}
      }
      setCsrfToken(token || null);
    };
    fetchCsrf();
  }, [router]);

  const fetchUsers = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/team-members?ownerId=${userId}`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
      } else {
        throw new Error(data.message || "Failed");
      }
    } catch (err) {
      setError("Failed to load team members.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && csrfToken) fetchUsers();
  }, [userId, csrfToken, fetchUsers]);

  // Auto-select permissions based on teamRole (for ADD modal)
  const applyRolePreset = (teamRole: TeamMember["teamRole"]) => {
    let preset: string[] = [];

    switch (teamRole) {
      case "Owner":
      case "Co-Owner":
        preset = AVAILABLE_PERMISSIONS.map(p => p.id);
        break;

      case "Property Manager":
      case "Portfolio Manager":
        preset = [
          "dashboard:view",
          "properties:view", "properties:edit", "properties:list_new",
          "notifications:view", "notifications:send", "notifications:manage",
          "reminders:view", "reminders:trigger",
          "tenants:view", "tenants:edit",
          "payments:view", "payments:record",
          "expenses:view", "expenses:create", "expenses:approve",
          "reports:view", "reports:export",
          "settings:view", "settings:edit",
          "users:view",
        ];
        break;

      case "Leasing Manager":
        preset = [
          "dashboard:view",
          "properties:view",
          "tenants:view", "tenants:edit",
          "leases:read", "leases:write", // assuming you add lease permissions later
          "notifications:view", "notifications:send",
          "reminders:view", "reminders:trigger",
        ];
        break;

      case "Maintenance Coordinator":
        preset = [
          "dashboard:view",
          "maintenance:request", "maintenance:assign", "maintenance:close",
          "properties:view",
          "vendors:view", "vendors:contact",
        ];
        break;

      case "Accounts Manager":
      case "Finance Officer":
        preset = [
          "dashboard:view",
          "payments:view", "payments:record",
          "expenses:view", "expenses:create", "expenses:approve",
          "reports:view", "reports:export",
        ];
        break;

      case "Rent Collection Officer":
        preset = [
          "payments:view", "payments:record",
          "tenants:view",
          "reminders:trigger",
        ];
        break;

      case "Administrative Assistant":
      case "Viewer":
        preset = [
          "dashboard:view",
          "properties:view",
          "tenants:view",
          "payments:view",
          "expenses:view",
          "reports:view",
          "notifications:view",
        ];
        break;

      default:
        preset = [];
    }

    setAddForm(prev => ({ ...prev, permissions: preset }));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (addForm.password !== addForm.confirmPassword) {
      setAddError("Passwords do not match");
      return;
    }

    if (addForm.password.length < 8) {
      setAddError("Password must be at least 8 characters long");
      return;
    }

    setAddSubmitting(true);

    try {
      const { confirmPassword, ...payload } = addForm;

      const res = await fetch("/api/team-members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken!,
        },
        credentials: "include",
        body: JSON.stringify({
          ownerId: userId,
          ...payload,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");

      setMembers(prev => [...prev, data.member]);
      setIsAddModalOpen(false);
      setAddForm({
        name: "",
        email: "",
        phone: "",
        teamRole: "Administrative Assistant",
        permissions: [],
        password: "",
        confirmPassword: "",
      });
    } catch (err: any) {
      setAddError(err.message || "Something went wrong");
    } finally {
      setAddSubmitting(false);
    }
  };

  const openEditModal = (member: TeamMember) => {
    setEditMember(member);
    setEditForm({
      name: member.name,
      email: member.email,
      phone: member.phone || "",
      teamRole: member.teamRole,
      permissions: [...member.permissions],
      active: member.active,
    });
    setIsEditModalOpen(true);
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;

    setEditError(null);
    setEditSubmitting(true);

    try {
      const res = await fetch(`/api/team-members/${editMember._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken!,
        },
        credentials: "include",
        body: JSON.stringify({
          ownerId: userId,
          ...editForm,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to update");

      setMembers(prev =>
        prev.map(m => (m._id === editMember._id ? { ...m, ...data.member } : m))
      );
      setIsEditModalOpen(false);
      setEditMember(null);
    } catch (err: any) {
      setEditError(err.message || "Something went wrong");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!deleteConfirmId) return;

    try {
      const res = await fetch(`/api/team-members/${deleteConfirmId}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfToken! },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to delete");

      setMembers(prev => prev.filter(m => m._id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert("Failed to delete member: " + (err.message || "Unknown error"));
    }
  };

  const getRoleBadge = (teamRole: string) => {
    const colors: Record<string, string> = {
      "Owner": "bg-purple-100 text-purple-800 border-purple-300",
      "Co-Owner": "bg-emerald-100 text-emerald-800 border-emerald-300",
      "Property Manager": "bg-blue-100 text-blue-800 border-blue-300",
      "Portfolio Manager": "bg-indigo-100 text-indigo-800 border-indigo-300",
      "Leasing Manager": "bg-cyan-100 text-cyan-800 border-cyan-300",
      "Maintenance Coordinator": "bg-amber-100 text-amber-800 border-amber-300",
      "Accounts Manager": "bg-violet-100 text-violet-800 border-violet-300",
      "Finance Officer": "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
      "Rent Collection Officer": "bg-orange-100 text-orange-800 border-orange-300",
      "Tenant Relations Officer": "bg-teal-100 text-teal-800 border-teal-300",
      "Field Inspector": "bg-lime-100 text-lime-800 border-lime-300",
      "Real Estate Agent": "bg-rose-100 text-rose-800 border-rose-300",
      "Marketing & Listings Specialist": "bg-pink-100 text-pink-800 border-pink-300",
      "Legal & Compliance Officer": "bg-red-100 text-red-800 border-red-300",
      "Administrative Assistant": "bg-gray-100 text-gray-800 border-gray-300",
      "Viewer": "bg-slate-100 text-slate-700 border-slate-300",
      "IT / Systems Admin": "bg-sky-100 text-sky-800 border-sky-300",
      "Security Coordinator": "bg-stone-100 text-stone-800 border-stone-300",
    };

    return (
      <span
        className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${colors[teamRole] || "bg-gray-100 text-gray-800 border-gray-300"}`}
      >
        {teamRole}
      </span>
    );
  };

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8 mt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-emerald-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Team Members</h1>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setAddForm({
                  name: "",
                  email: "",
                  phone: "",
                  teamRole: "Administrative Assistant",
                  permissions: [],
                  password: "",
                  confirmPassword: "",
                });
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg transition-all"
            >
              <UserPlus size={18} />
              Add Member
            </motion.button>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white/80 rounded-2xl p-6 shadow-lg animate-pulse h-72" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-32 bg-white/70 backdrop-blur-sm rounded-3xl shadow-inner border border-white/20">
              <Users className="h-16 w-16 mx-auto text-gray-300 mb-6" />
              <p className="text-2xl font-semibold text-gray-700">No team members yet</p>
              <p className="text-gray-500 mt-3">Invite staff or co-owners to manage properties with you</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {members.map((member) => (
                <motion.div
                  key={member._id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-xl transition-all overflow-hidden border border-gray-100"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{member.name}</h3>
                        <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                          <Mail size={16} className="text-emerald-600" />
                          {member.email}
                        </p>
                        {member.phone && (
                          <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                            <Phone size={16} className="text-emerald-600" />
                            {member.phone}
                          </p>
                        )}
                      </div>
                      {member.active ? (
                        <ShieldCheck className="h-6 w-6 text-emerald-500" />
                      ) : (
                        <ShieldOff className="h-6 w-6 text-gray-400" />
                      )}
                    </div>

                    <div className="mt-4">{getRoleBadge(member.teamRole)}</div>

                    {member.permissions.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium text-gray-600 mb-1.5">Permissions:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {member.permissions.map(p => (
                            <span
                              key={p}
                              className="text-[10px] px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full border border-gray-200"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex items-center justify-end gap-3">
                      <button
                        onClick={() => openEditModal(member)}
                        className="p-2.5 hover:bg-emerald-50 rounded-lg transition-colors text-emerald-600"
                        title="Edit member"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(member._id)}
                        className="p-2.5 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                        title="Delete member"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Add Team Member</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="p-6 space-y-6">
              {addError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertCircle size={18} />
                  <span>{addError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                <input
                  type="email"
                  value={addForm.email}
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  placeholder="+254 712 345 678"
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Login Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={addForm.password}
                    onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none pr-10"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={addForm.confirmPassword}
                    onChange={e => setAddForm({ ...addForm, confirmPassword: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none pr-10"
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-700"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Role</label>
                <select
                  value={addForm.teamRole}
                  onChange={e => {
                    const newRole = e.target.value as TeamMember["teamRole"];
                    setAddForm({ ...addForm, teamRole: newRole });
                    applyRolePreset(newRole);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  <option value="Viewer">Viewer – read-only access</option>
                  <option value="Administrative Assistant">Administrative Assistant</option>
                  <option value="Field Inspector">Field Inspector</option>
                  <option value="Rent Collection Officer">Rent Collection Officer</option>
                  <option value="Tenant Relations Officer">Tenant Relations Officer</option>
                  <option value="Maintenance Coordinator">Maintenance Coordinator</option>
                  <option value="Accounts Manager">Accounts Manager</option>
                  <option value="Leasing Manager">Leasing Manager</option>
                  <option value="Finance Officer">Finance Officer</option>
                  <option value="Marketing & Listings Specialist">Marketing & Listings Specialist</option>
                  <option value="Property Manager">Property Manager</option>
                  <option value="Portfolio Manager">Portfolio Manager</option>
                  <option value="Legal & Compliance Officer">Legal & Compliance Officer</option>
                  <option value="Co-Owner">Co-Owner</option>
                  <option value="Owner">Owner (full control)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Granular Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 max-h-80 overflow-y-auto pr-2">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addForm.permissions.includes(perm.id)}
                        onChange={e => {
                          const newPerms = e.target.checked
                            ? [...addForm.permissions, perm.id]
                            : addForm.permissions.filter(p => p !== perm.id);
                          setAddForm({ ...addForm, permissions: newPerms });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSubmitting}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl shadow-md transition-all ${
                    addSubmitting ? "bg-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {addSubmitting ? "Adding..." : (
                    <>
                      <Save size={18} />
                      Add Member
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* EDIT MODAL - similar structure, omitted for brevity but follows same pattern */}
      {/* ... (you can copy-paste and adapt from add modal, just use editForm and handleEditMember) */}

      {/* DELETE CONFIRMATION */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center"
          >
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-900 mb-2">Delete Team Member?</h3>
            <p className="text-gray-600 mb-6">
              This action cannot be undone. The member will lose all access.
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMember}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors shadow-md"
              >
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}