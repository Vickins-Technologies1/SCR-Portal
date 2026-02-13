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
  teamRole: "Co-Owner" | "Manager" | "Accountant" | "Assistant" | "Viewer";
  permissions: string[];
  active: boolean;
  lastActive?: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: "dashboard:view", label: "Overview (Dashboard)" },
  { id: "properties:view", label: "View Properties" },
  { id: "properties:edit", label: "Edit Properties" },
  { id: "properties:list_new", label: "List New Property" },
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
  { id: "users:manage", label: "Manage Team Members" },
  { id: "settings:view", label: "Settings" },
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
    teamRole: "Assistant" as TeamMember["teamRole"],
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

    if (teamRole === "Co-Owner") {
      preset = AVAILABLE_PERMISSIONS.map((p) => p.id);
    } else if (teamRole === "Manager") {
      preset = [
        "dashboard:view",
        "properties:view", "properties:edit", "properties:list_new",
        "tenants:view", "tenants:edit",
        "payments:view", "payments:record",
        "expenses:view", "expenses:create", "expenses:approve",
        "reports:view", "reports:export",
        "settings:view",
        "users:view",
      ];
    } else if (teamRole === "Accountant") {
      preset = [
        "dashboard:view",
        "payments:view", "payments:record",
        "expenses:view", "expenses:create", "expenses:approve",
        "reports:view", "reports:export",
      ];
    } else if (teamRole === "Assistant") {
      preset = [
        "dashboard:view",
        "properties:view",
        "tenants:view",
        "payments:view",
        "expenses:view",
        "reports:view",
      ];
    } else if (teamRole === "Viewer") {
      preset = [
        "dashboard:view",
        "properties:view",
        "tenants:view",
        "payments:view",
        "expenses:view",
        "reports:view",
      ];
    }

    setAddForm((prev) => ({ ...prev, permissions: preset }));
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

      setMembers((prev) => [...prev, data.member]);
      setIsAddModalOpen(false);
      setAddForm({
        name: "",
        email: "",
        phone: "",
        teamRole: "Assistant",
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

      setMembers((prev) =>
        prev.map((m) => (m._id === editMember._id ? { ...m, ...data.member } : m))
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

      setMembers((prev) => prev.filter((m) => m._id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err: any) {
      alert("Failed to delete member: " + (err.message || "Unknown error"));
    }
  };

  const getRoleBadge = (teamRole: string) => {
    const colors: Record<string, string> = {
      "Co-Owner": "bg-emerald-100 text-emerald-800",
      Manager: "bg-blue-100 text-blue-800",
      Accountant: "bg-purple-100 text-purple-800",
      Assistant: "bg-amber-100 text-amber-800",
      Viewer: "bg-gray-100 text-gray-700",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${colors[teamRole] || "bg-gray-100 text-gray-800"}`}>
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
                  teamRole: "Assistant",
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
                          {member.permissions.map((p) => (
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
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
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
                  onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
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
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
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
                    onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
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
                    onChange={(e) => setAddForm({ ...addForm, confirmPassword: e.target.value })}
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
                  onChange={(e) => {
                    const newTeamRole = e.target.value as TeamMember["teamRole"];
                    setAddForm({ ...addForm, teamRole: newTeamRole });
                    applyRolePreset(newTeamRole);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  <option value="Viewer">Viewer – read-only access</option>
                  <option value="Assistant">Assistant – limited edits</option>
                  <option value="Accountant">Accountant – financial access</option>
                  <option value="Manager">Manager – broad access</option>
                  <option value="Co-Owner">Co-Owner – near full access</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Granular Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={addForm.permissions.includes(perm.id)}
                        onChange={(e) => {
                          const newPerms = e.target.checked
                            ? [...addForm.permissions, perm.id]
                            : addForm.permissions.filter((p) => p !== perm.id);
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

      {/* EDIT MODAL */}
      {isEditModalOpen && editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">Edit Team Member</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleEditMember} className="p-6 space-y-6">
              {editError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertCircle size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={editForm.name || ""}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={editForm.email || ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                <input
                  type="tel"
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
                <select
                  value={editForm.teamRole || "Assistant"}
                  onChange={(e) => {
                    const newTeamRole = e.target.value as TeamMember["teamRole"];
                    setEditForm({ ...editForm, teamRole: newTeamRole });
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white"
                >
                  <option value="Viewer">Viewer – read-only access</option>
                  <option value="Assistant">Assistant – limited edits</option>
                  <option value="Accountant">Accountant – financial access</option>
                  <option value="Manager">Manager – broad access</option>
                  <option value="Co-Owner">Co-Owner – near full access</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.permissions?.includes(perm.id) || false}
                        onChange={(e) => {
                          const newPerms = e.target.checked
                            ? [...(editForm.permissions || []), perm.id]
                            : (editForm.permissions || []).filter((p) => p !== perm.id);
                          setEditForm({ ...editForm, permissions: newPerms });
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
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl shadow-md transition-all ${
                    editSubmitting ? "bg-emerald-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {editSubmitting ? "Saving..." : (
                    <>
                      <Save size={18} />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

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