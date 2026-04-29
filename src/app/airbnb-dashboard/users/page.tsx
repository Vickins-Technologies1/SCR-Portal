// src/app/airbnb-dashboard/users/page.tsx
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
  Send,
  AlertCircle,
  X,
  Save,
} from "lucide-react";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import { useAccountTier } from "@/hooks/useAccountTier";
import PremiumGate from "@/components/PremiumGate";

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
  { id: "integrations:view", label: "View Integrations" },
  { id: "integrations:edit", label: "Manage Integrations" },
  { id: "users:view", label: "View Team Members" },
  { id: "users:manage", label: "Manage Team Members (add/edit/delete)" },
  { id: "roles:manage", label: "Manage Roles & Permissions" },
  { id: "settings:view", label: "View Settings" },
  { id: "settings:edit", label: "Edit Settings" },
  { id: "security:manage", label: "Manage Security & Access" },
];

const PERMISSION_ID_SET = new Set(AVAILABLE_PERMISSIONS.map(p => p.id));

const normalizePermissions = (permissions: string[]) =>
  Array.from(new Set(permissions.filter(p => PERMISSION_ID_SET.has(p))));

const ROLE_PRESETS: Record<TeamMember["teamRole"], string[]> = {
  "Owner": AVAILABLE_PERMISSIONS.map(p => p.id),
  "Co-Owner": AVAILABLE_PERMISSIONS.map(p => p.id),
  "Property Manager": [
    "dashboard:view",
    "properties:view", "properties:edit", "properties:list_new",
    "notifications:view", "notifications:send", "notifications:manage",
    "reminders:view", "reminders:trigger",
    "communications:access",
    "tenants:view", "tenants:edit",
    "payments:view", "payments:record",
    "expenses:view", "expenses:create", "expenses:approve",
    "reports:view", "reports:export",
    "users:view",
    "integrations:view", "integrations:edit",
    "settings:view", "settings:edit",
  ],
  "Portfolio Manager": [
    "dashboard:view",
    "properties:view", "properties:edit", "properties:list_new",
    "notifications:view", "notifications:send", "notifications:manage",
    "reminders:view", "reminders:trigger",
    "communications:access",
    "tenants:view", "tenants:edit",
    "payments:view", "payments:record",
    "expenses:view", "expenses:create", "expenses:approve",
    "reports:view", "reports:export",
    "users:view",
    "integrations:view",
    "settings:view",
  ],
  "Leasing Manager": [
    "dashboard:view",
    "properties:view",
    "tenants:view", "tenants:edit",
    "notifications:view", "notifications:send",
    "reminders:view", "reminders:trigger",
    "communications:access",
    "reports:view",
  ],
  "Maintenance Coordinator": [
    "dashboard:view",
    "properties:view",
    "notifications:view", "notifications:send",
    "reminders:view", "reminders:trigger",
    "expenses:view", "expenses:create",
    "reports:view",
  ],
  "Accounts Manager": [
    "dashboard:view",
    "payments:view", "payments:record",
    "expenses:view", "expenses:create", "expenses:approve",
    "reports:view", "reports:export",
    "integrations:view",
  ],
  "Finance Officer": [
    "dashboard:view",
    "payments:view", "payments:record",
    "expenses:view", "expenses:create", "expenses:approve",
    "reports:view", "reports:export",
    "settings:view",
  ],
  "Rent Collection Officer": [
    "dashboard:view",
    "tenants:view",
    "payments:view", "payments:record",
    "reminders:view", "reminders:trigger",
    "notifications:view", "notifications:send",
  ],
  "Tenant Relations Officer": [
    "dashboard:view",
    "tenants:view", "tenants:edit",
    "notifications:view", "notifications:send",
    "reminders:view", "reminders:trigger",
    "communications:access",
  ],
  "Field Inspector": [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "reports:view",
  ],
  "Real Estate Agent": [
    "dashboard:view",
    "properties:view", "properties:list_new",
    "notifications:view",
    "communications:access",
    "reports:view",
  ],
  "Marketing & Listings Specialist": [
    "dashboard:view",
    "properties:view", "properties:list_new",
    "notifications:view", "notifications:send",
    "communications:access",
  ],
  "Legal & Compliance Officer": [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "reports:view", "reports:export",
    "settings:view",
  ],
  "Administrative Assistant": [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "payments:view",
    "expenses:view",
    "notifications:view",
    "reminders:view",
    "communications:access",
    "reports:view",
  ],
  "Viewer": [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "payments:view",
    "expenses:view",
    "reports:view",
    "notifications:view",
  ],
  "IT / Systems Admin": [
    "dashboard:view",
    "users:view", "users:manage",
    "roles:manage",
    "settings:view", "settings:edit",
    "security:manage",
    "reports:view",
  ],
  "Security Coordinator": [
    "dashboard:view",
    "properties:view",
    "tenants:view",
    "notifications:view",
    "reminders:view",
  ],
};

const TEAM_ROLE_OPTIONS: Array<{ value: TeamMember["teamRole"]; label: string }> = [
  { value: "Viewer", label: "Viewer – read-only access" },
  { value: "Administrative Assistant", label: "Administrative Assistant" },
  { value: "Field Inspector", label: "Field Inspector" },
  { value: "Rent Collection Officer", label: "Rent Collection Officer" },
  { value: "Tenant Relations Officer", label: "Tenant Relations Officer" },
  { value: "Maintenance Coordinator", label: "Maintenance Coordinator" },
  { value: "Accounts Manager", label: "Accounts Manager" },
  { value: "Leasing Manager", label: "Leasing Manager" },
  { value: "Finance Officer", label: "Finance Officer" },
  { value: "Marketing & Listings Specialist", label: "Marketing & Listings Specialist" },
  { value: "Real Estate Agent", label: "Real Estate Agent" },
  { value: "Legal & Compliance Officer", label: "Legal & Compliance Officer" },
  { value: "Property Manager", label: "Property Manager" },
  { value: "Portfolio Manager", label: "Portfolio Manager" },
  { value: "IT / Systems Admin", label: "IT / Systems Admin" },
  { value: "Security Coordinator", label: "Security Coordinator" },
  { value: "Co-Owner", label: "Co-Owner" },
  { value: "Owner", label: "Owner (full control)" },
];

const getRolePreset = (teamRole: TeamMember["teamRole"]) =>
  normalizePermissions(ROLE_PRESETS[teamRole] ?? []);

const normalizeTeamRole = (role: string | undefined): TeamMember["teamRole"] =>
  TEAM_ROLE_OPTIONS.some(option => option.value === role)
    ? (role as TeamMember["teamRole"])
    : "Viewer";

export default function UsersPage() {
  const router = useRouter();
  const { isFree } = useAccountTier();
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<"propertyOwner" | "teamMember" | null>(null);
  const [sessionPermissions, setSessionPermissions] = useState<string[]>([]);

  // Add modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    phone: "",
    teamRole: "Administrative Assistant" as TeamMember["teamRole"],
    permissions: getRolePreset("Administrative Assistant"),
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
  const [resendSubmittingId, setResendSubmittingId] = useState<string | null>(null);
  const [resendTarget, setResendTarget] = useState<TeamMember | null>(null);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const canViewUsers =
    sessionRole === "propertyOwner" ||
    (sessionRole === "teamMember" && sessionPermissions.includes("users:view"));

  const canManageUsers =
    sessionRole === "propertyOwner" ||
    (sessionRole === "teamMember" && sessionPermissions.includes("users:manage"));

  const editPermissions = Array.isArray(editForm.permissions) ? editForm.permissions : [];
  const editRoleValue = normalizeTeamRole(editForm.teamRole);

  // Auth & CSRF
  useEffect(() => {
    const uid = Cookies.get("userId");
    const role = Cookies.get("role");
    const ownerId = Cookies.get("ownerId");
    const rawPermissions = Cookies.get("permissions");
    let parsedPermissions: string[] = [];

    if (rawPermissions) {
      try {
        const parsed = JSON.parse(rawPermissions);
        parsedPermissions = Array.isArray(parsed) ? parsed : [];
      } catch {
        parsedPermissions = [];
      }
    }

    if (!uid || !role) {
      router.replace("/");
      return;
    }

    if (role === "propertyOwner") {
      setUserId(uid);
      setSessionRole("propertyOwner");
      setSessionPermissions(parsedPermissions);
    } else if (role === "teamMember") {
      if (!parsedPermissions.includes("users:view")) {
        router.replace("/airbnb-dashboard");
        return;
      }

      if (!ownerId) {
        router.replace("/");
        return;
      }

      setUserId(ownerId);
      setSessionRole("teamMember");
      setSessionPermissions(parsedPermissions);
    } else {
      router.replace("/");
      return;
    }

    const fetchCsrf = async () => {
      let token = Cookies.get("csrf-token");
      if (!token) {
        try {
          const res = await fetch("/api/csrf-token", { credentials: "include" });
          const data = await res.json();
          if (data.csrfToken) {
            Cookies.set("csrf-token", data.csrfToken, { sameSite: "strict", path: "/" });
            token = data.csrfToken;
          }
        } catch {}
      }
      setCsrfToken(token || null);
    };
    fetchCsrf();
  }, [router]);

  const fetchUsers = useCallback(async () => {
    if (!userId || !csrfToken || !canViewUsers) return;
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
  }, [userId, csrfToken, canViewUsers]);

  useEffect(() => {
    if (userId && csrfToken && canViewUsers) fetchUsers();
  }, [userId, csrfToken, canViewUsers, fetchUsers]);

  // Auto-select permissions based on teamRole
  const applyRolePresetToAdd = (teamRole: TeamMember["teamRole"]) => {
    setAddForm(prev => ({ ...prev, teamRole, permissions: getRolePreset(teamRole) }));
  };

  const applyRolePresetToEdit = (teamRole: TeamMember["teamRole"]) => {
    setEditForm(prev => ({ ...prev, teamRole, permissions: getRolePreset(teamRole) }));
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    if (!userId) {
      setAddError("Session expired. Please log in again.");
      return;
    }

    if (!canManageUsers) {
      setAddError("You don't have permission to add team members.");
      return;
    }

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
      const { confirmPassword, permissions, ...payload } = addForm;
      const safePermissions = normalizePermissions(permissions);

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
          permissions: safePermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed");

      setMembers(prev => [...prev, data.member]);
      setIsAddModalOpen(false);
      const defaultRole: TeamMember["teamRole"] = "Administrative Assistant";
      setAddForm({
        name: "",
        email: "",
        phone: "",
        teamRole: defaultRole,
        permissions: getRolePreset(defaultRole),
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
    if (!canManageUsers) return;
    setEditMember(member);
    setEditForm({
      name: member.name,
      email: member.email,
      phone: member.phone || "",
      teamRole: normalizeTeamRole(member.teamRole),
      permissions: normalizePermissions(member.permissions || []),
      active: member.active,
    });
    setIsEditModalOpen(true);
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;

    if (!userId) {
      setEditError("Session expired. Please log in again.");
      return;
    }

    if (!canManageUsers) {
      setEditError("You don't have permission to edit team members.");
      return;
    }

    setEditError(null);
    setEditSubmitting(true);

    try {
      const payload: Record<string, unknown> = { ownerId: userId };
      if (editForm.name !== undefined) payload.name = editForm.name;
      if (editForm.email !== undefined) payload.email = editForm.email;
      if (editForm.phone !== undefined) payload.phone = editForm.phone;
      if (editForm.teamRole !== undefined) payload.teamRole = editForm.teamRole;
      if (editForm.permissions !== undefined) {
        payload.permissions = normalizePermissions(editForm.permissions);
      }
      if (editForm.active !== undefined) payload.active = editForm.active;

      const res = await fetch(`/api/team-members/${editMember._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken!,
        },
        credentials: "include",
        body: JSON.stringify(payload),
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
    if (!canManageUsers) return;

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

  const openResendModal = (member: TeamMember) => {
    if (!canManageUsers) return;
    if (!member.phone) {
      setError("This team member does not have a phone number.");
      return;
    }
    setError(null);
    setResendSuccess(null);
    setResendTarget(member);
  };

  const handleResendLoginSms = async (member: TeamMember) => {
    if (!canManageUsers) return;
    if (!csrfToken) {
      setError("Security token missing. Please refresh the page.");
      return;
    }
    if (!member.phone) {
      setError("This team member does not have a phone number.");
      return;
    }

    setResendSubmittingId(member._id);
    setError(null);
    setResendSuccess(null);
    try {
      const res = await fetch(`/api/team-members/${member._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ action: "resend-login-sms" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to resend login SMS");
      setResendSuccess(`Login SMS sent to ${member.name}.`);
      setResendTarget(null);
    } catch (err: any) {
      setError(err.message || "Failed to resend login SMS.");
    } finally {
      setResendSubmittingId(null);
    }
  };

  const getRoleBadge = (teamRole: string) => {
    const colors: Record<string, string> = {
      "Owner": "bg-purple-100 text-purple-800 border-purple-300",
      "Co-Owner": "bg-primary/10 text-primary border-primary/40",
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
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Team Members</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Invite staff and assign roles with the right permissions.
                  </p>
                </div>
              </div>
              {canManageUsers && !isFree ? (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setAddForm({
                      name: "",
                      email: "",
                      phone: "",
                      teamRole: "Administrative Assistant",
                      permissions: getRolePreset("Administrative Assistant"),
                      password: "",
                      confirmPassword: "",
                    });
                    setIsAddModalOpen(true);
                  }}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold shadow-lg transition-all"
                >
                  <UserPlus size={16} />
                  Add Member
                </motion.button>
              ) : (
                <span className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                  View-only access
                </span>
              )}
            </div>
          </section>

          {isFree && (
            <div className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Premium only</p>
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                Team members & permissions are locked on Free tier
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Upgrade to Premium to view/manage users, roles, and permissions.
              </p>
              <a
                href="/upgrade"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
              >
                Upgrade
              </a>
            </div>
          )}

          <PremiumGate
            locked={isFree}
            title="Upgrade to unlock user management"
            message="Free tier hides critical user operations. Upgrade to Premium to manage team members and permissions."
          >
          {error && (
            <div className="mb-6 bg-red-50 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
          {resendSuccess && (
            <div className="mb-6 bg-green-50 text-green-700 px-5 py-4 rounded-2xl flex items-center gap-3">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-medium">{resendSuccess}</span>
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
                          <Mail size={16} className="text-primary" />
                          {member.email}
                        </p>
                        {member.phone && (
                          <p className="text-sm text-gray-600 mt-1 flex items-center gap-2">
                            <Phone size={16} className="text-primary" />
                            {member.phone}
                          </p>
                        )}
                      </div>
                      {member.active ? (
                        <ShieldCheck className="h-6 w-6 text-primary" />
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

                    {canManageUsers && (
                      <div className="mt-6 flex items-center justify-end gap-3">
                        {member.phone && (
                          <button
                            onClick={() => openResendModal(member)}
                            className="p-2.5 hover:bg-blue-50 rounded-lg transition-colors text-blue-600 disabled:opacity-60"
                            title="Resend login SMS"
                            disabled={resendSubmittingId === member._id}
                          >
                            <Send size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(member)}
                          className="p-2.5 hover:bg-primary/10 rounded-lg transition-colors text-primary"
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
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
          </PremiumGate>
        </main>
      </div>

      {/* ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-panel w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="modal-header sticky top-0 z-10 flex items-center justify-between px-6 py-5">
              <h2 className="text-xl font-bold text-gray-900">Add Team Member</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="modal-close rounded-full p-2">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleAddMember} className="modal-body modal-stagger space-y-6">
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none pr-10"
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
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none pr-10"
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
                    applyRolePresetToAdd(newRole);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none bg-white"
                >
                  {TEAM_ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
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
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40"
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
                    addSubmitting ? "bg-primary/70 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"
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

      {isEditModalOpen && editMember && (
        <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-panel w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="modal-header sticky top-0 z-10 flex items-center justify-between px-6 py-5">
              <h2 className="text-xl font-bold text-gray-900">Edit Team Member</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditMember(null);
                }}
                className="modal-close rounded-full p-2"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <form onSubmit={handleEditMember} className="modal-body modal-stagger space-y-6">
              {editError && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertCircle size={18} />
                  <span>{editError}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  value={editForm.name ?? ""}
                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                <input
                  type="email"
                  value={editForm.email ?? ""}
                  onChange={e => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                  placeholder="john@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone (optional)</label>
                <input
                  type="tel"
                  value={editForm.phone ?? ""}
                  onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none"
                  placeholder="+254 712 345 678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Primary Role</label>
                <select
                  value={editRoleValue}
                  onChange={e => {
                    const newRole = e.target.value as TeamMember["teamRole"];
                    applyRolePresetToEdit(newRole);
                  }}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none bg-white"
                >
                  {TEAM_ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!editForm.active}
                  onChange={e => setEditForm(prev => ({ ...prev, active: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40"
                />
                <span className="text-sm text-gray-700">Active account</span>
              </label>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Granular Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 max-h-80 overflow-y-auto pr-2">
                  {AVAILABLE_PERMISSIONS.map(perm => (
                    <label key={perm.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPermissions.includes(perm.id)}
                        onChange={e => {
                          const newPerms = e.target.checked
                            ? [...editPermissions, perm.id]
                            : editPermissions.filter(p => p !== perm.id);
                          setEditForm(prev => ({ ...prev, permissions: newPerms }));
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/40"
                      />
                      <span className="text-sm text-gray-700">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditMember(null);
                  }}
                  className="px-6 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className={`flex items-center gap-2 px-6 py-2.5 text-white rounded-xl shadow-md transition-all ${
                    editSubmitting ? "bg-primary/70 cursor-not-allowed" : "bg-primary hover:bg-primary-hover"
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

      {resendTarget && (
        <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-panel p-8 max-w-sm w-full text-center max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="modal-stagger">
              <Send className="h-12 w-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Resend Login SMS?</h3>
              <p className="text-gray-600 mb-2">
                This will reset the password and send new login details to:
              </p>
              <p className="text-sm font-semibold text-gray-900 mb-6">
                {resendTarget.name} {resendTarget.phone ? `(${resendTarget.phone})` : ""}
              </p>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => setResendTarget(null)}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-colors"
                  disabled={resendSubmittingId === resendTarget._id}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleResendLoginSms(resendTarget)}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors shadow-md"
                  disabled={resendSubmittingId === resendTarget._id}
                >
                  {resendSubmittingId === resendTarget._id ? "Sending..." : "Resend SMS"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center modal-backdrop p-4 overflow-y-auto sm:items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-panel p-8 max-w-sm w-full text-center max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="modal-stagger">
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
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}





























