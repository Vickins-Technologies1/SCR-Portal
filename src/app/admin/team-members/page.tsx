"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Edit,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  UserCog,
  XCircle,
} from "lucide-react";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import Modal from "../components/Modal";
import { cn } from "@/lib/cn";
import {
  ADMIN_PERMISSION_GROUPS,
  ADMIN_ROLE_PRESETS,
  getAdminRolePreset,
  normalizeAdminPermissions,
  type AdminPermission,
} from "@/lib/admin-permissions";

type Status = "checking" | "authenticated" | "unauthenticated";

type AdminAccount = {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: "admin";
  active: true;
  createdAt: string | null;
  lastLoginAt: string | null;
};

type TeamMemberAccount = {
  _id: string;
  role: "adminTeamMember";
  teamRole: string;
  name: string;
  email: string;
  phone: string;
  permissions: string[];
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

const safeParsePermissions = (raw: string | undefined): AdminPermission[] => {
  if (!raw) return [];
  try {
    return normalizeAdminPermissions(JSON.parse(raw));
  } catch {
    return [];
  }
};

const generateStrongPassword = () => {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@$!%*?&";

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)]!;
  const base = [
    pick(upper),
    pick(lower),
    pick(digits),
    pick(special),
  ];

  const all = upper + lower + digits + special;
  while (base.length < 12) base.push(pick(all));

  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [base[i], base[j]] = [base[j]!, base[i]!];
  }

  return base.join("");
};

export default function AdminTeamMembersPage() {
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editTarget, setEditTarget] = useState<TeamMemberAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMemberAccount | null>(null);

  const permissionsCookie = typeof window !== "undefined" ? Cookies.get("permissions") : undefined;
  const isAdminOwner = typeof window !== "undefined" ? Cookies.get("role") === "admin" : false;
  const myPermissions = useMemo(() => safeParsePermissions(permissionsCookie), [permissionsCookie]);
  const canManageTeam =
    isAdminOwner || myPermissions.includes("admin:team-members:manage");

  const [createForm, setCreateForm] = useState<{
    name: string;
    email: string;
    phone: string;
    teamRole: string;
    permissions: AdminPermission[];
    password: string;
  }>({
    name: "",
    email: "",
    phone: "",
    teamRole: "Operations",
    permissions: getAdminRolePreset("Operations"),
    password: generateStrongPassword(),
  });

  const [editForm, setEditForm] = useState<{
    name: string;
    phone: string;
    teamRole: string;
    permissions: AdminPermission[];
    active: boolean;
    password: string;
  }>({
    name: "",
    phone: "",
    teamRole: "Custom",
    permissions: [],
    active: true,
    password: "",
  });

  const teamRoleOptions = useMemo(() => Object.keys(ADMIN_ROLE_PRESETS), []);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Session invalid");
      const data = await res.json();
      if (!data.authenticated) throw new Error("Not authenticated");
      setStatus("authenticated");
    } catch {
      setStatus("unauthenticated");
      router.replace("/admin/login?session=expired");
    }
  }, [router]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const ensureCsrfToken = useCallback(async () => {
    if (csrfToken) return csrfToken;
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include", cache: "no-store" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken as string;
      }
    } catch {
      // ignore
    }
    return null;
  }, [csrfToken]);

  const fetchTeam = useCallback(async () => {
    if (status !== "authenticated") return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/team-members", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const msg = res.status === 403 ? "You don't have permission to view this page." : "Failed to load team members.";
        throw new Error(msg);
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to load team members.");

      setAdmins(Array.isArray(data.admins) ? data.admins : []);
      setTeamMembers(Array.isArray(data.teamMembers) ? data.teamMembers : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load team members.");
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    if (status === "authenticated") fetchTeam();
  }, [status, fetchTeam]);

  useEffect(() => {
    if (status === "authenticated") {
      ensureCsrfToken();
    }
  }, [status, ensureCsrfToken]);

  const openCreate = () => {
    setCreateForm({
      name: "",
      email: "",
      phone: "",
      teamRole: "Operations",
      permissions: getAdminRolePreset("Operations"),
      password: generateStrongPassword(),
    });
    setShowCreate(true);
  };

  const openEdit = (member: TeamMemberAccount) => {
    setEditTarget(member);
    setEditForm({
      name: member.name || "",
      phone: member.phone || "",
      teamRole: member.teamRole || "Custom",
      permissions: normalizeAdminPermissions(member.permissions || []),
      active: Boolean(member.active),
      password: "",
    });
    setShowEdit(true);
  };

  const openDelete = (member: TeamMemberAccount) => {
    setDeleteTarget(member);
    setShowDelete(true);
  };

  const togglePerm = (perm: AdminPermission, which: "create" | "edit") => {
    if (which === "create") {
      setCreateForm((prev) => {
        const next = prev.permissions.includes(perm)
          ? prev.permissions.filter((p) => p !== perm)
          : [...prev.permissions, perm];
        return { ...prev, permissions: normalizeAdminPermissions(next) };
      });
      return;
    }

    setEditForm((prev) => {
      const next = prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm];
      return { ...prev, permissions: normalizeAdminPermissions(next) };
    });
  };

  const handleCreate = async () => {
    if (!canManageTeam) {
      setError("You don't have permission to create team members.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await ensureCsrfToken();
      if (!token) throw new Error("Security token missing. Please refresh and try again.");

      const res = await fetch("/api/admin/team-members", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        body: JSON.stringify({
          name: createForm.name,
          email: createForm.email,
          phone: createForm.phone,
          teamRole: createForm.teamRole,
          permissions: createForm.permissions,
          password: createForm.password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create team member.");
      }

      setShowCreate(false);
      await fetchTeam();
    } catch (err: any) {
      setError(err?.message || "Failed to create team member.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    if (!canManageTeam) {
      setError("You don't have permission to edit team members.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await ensureCsrfToken();
      if (!token) throw new Error("Security token missing. Please refresh and try again.");

      const res = await fetch(`/api/admin/team-members/${editTarget._id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        body: JSON.stringify({
          name: editForm.name,
          phone: editForm.phone,
          teamRole: editForm.teamRole,
          permissions: editForm.permissions,
          active: editForm.active,
          password: editForm.password || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update team member.");
      }

      setShowEdit(false);
      setEditTarget(null);
      await fetchTeam();
    } catch (err: any) {
      setError(err?.message || "Failed to update team member.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (!canManageTeam) {
      setError("You don't have permission to delete team members.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await ensureCsrfToken();
      if (!token) throw new Error("Security token missing. Please refresh and try again.");

      const res = await fetch(`/api/admin/team-members/${deleteTarget._id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          "x-csrf-token": token,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to delete team member.");
      }

      setShowDelete(false);
      setDeleteTarget(null);
      await fetchTeam();
    } catch (err: any) {
      setError(err?.message || "Failed to delete team member.");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="min-h-[100svh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-primary" />
          <p className="text-lg font-medium text-muted-foreground">Verifying admin session...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="min-h-[100svh] bg-transparent text-foreground">
      <Navbar isSidebarOpen={isSidebarOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <UserCog className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Company</p>
                  <h1 className="text-xl sm:text-2xl font-semibold">Team Members</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Create staff accounts, define access, and keep sensitive data scoped.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchTeam}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-white/70 px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-white"
                >
                  <RefreshCw className={cn("h-4 w-4", isLoading ? "animate-spin" : "")} />
                  Refresh
                </button>
                <button
                  onClick={openCreate}
                  disabled={!canManageTeam}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                  title={!canManageTeam ? "You don't have permission to manage team members." : "Add team member"}
                >
                  <Plus className="h-4 w-4" />
                  Add Member
                </button>
              </div>
            </div>
          </motion.section>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-start gap-3">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-xs sm:text-sm">{error}</p>
              </div>
            </div>
          )}

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="glass-panel rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h2 className="text-sm sm:text-base font-semibold">Existing Admin Owners</h2>
                </div>
                <span className="text-xs text-muted-foreground">{admins.length} account(s)</span>
              </div>
              <div className="mt-4 space-y-3">
                {admins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No admin owners found.</p>
                ) : (
                  admins.map((a) => (
                    <div key={a._id} className="rounded-2xl border border-border bg-white/70 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                          {a.phone ? <p className="text-xs text-muted-foreground">{a.phone}</p> : null}
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Full access
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        {a.lastLoginAt ? <span>Last login: {new Date(a.lastLoginAt).toLocaleString()}</span> : <span>Never logged in</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-primary" />
                  <h2 className="text-sm sm:text-base font-semibold">Staff Accounts</h2>
                </div>
                <span className="text-xs text-muted-foreground">{teamMembers.length} member(s)</span>
              </div>

              <div className="mt-4 space-y-3">
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No staff accounts yet.</p>
                ) : (
                  teamMembers.map((m) => (
                    <div
                      key={m._id}
                      className={cn(
                        "rounded-2xl border bg-white/70 px-4 py-3",
                        m.active ? "border-border" : "border-red-200 opacity-80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{m.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                              {m.teamRole || "Custom"}
                            </span>
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                              {(m.permissions?.length || 0).toString()} perms
                            </span>
                            {!m.active && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                                <XCircle className="h-3.5 w-3.5" />
                                Disabled
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(m)}
                            disabled={!canManageTeam}
                            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-2.5 py-2 text-muted-foreground hover:text-primary disabled:opacity-50"
                            title={canManageTeam ? "Edit member" : "No permission"}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openDelete(m)}
                            disabled={!canManageTeam}
                            className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-2.5 py-2 text-muted-foreground hover:text-red-600 disabled:opacity-50"
                            title={canManageTeam ? "Delete member" : "No permission"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {m.lastLoginAt ? (
                          <span>Last login: {new Date(m.lastLoginAt).toLocaleString()}</span>
                        ) : (
                          <span>Never logged in</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <h2 className="text-sm sm:text-base font-semibold">Access guide</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Use presets for speed, then fine-tune permissions per person. Keep “Manage property owners” and “Impersonate owners”
              restricted to trusted staff.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ADMIN_PERMISSION_GROUPS.map((group) => (
                <div key={group.key} className="rounded-2xl border border-border bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                    {group.title}
                  </p>
                  <ul className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <li key={item.key}>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      <Modal title="Add Team Member" isOpen={showCreate} onClose={() => setShowCreate(false)}>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Email</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                value={createForm.email}
                onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Phone (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                value={createForm.phone}
                onChange={(e) => setCreateForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Role preset</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={createForm.teamRole}
                onChange={(e) => {
                  const teamRole = e.target.value;
                  setCreateForm((p) => ({ ...p, teamRole, permissions: getAdminRolePreset(teamRole) }));
                }}
              >
                {teamRoleOptions.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-muted-foreground">Password</label>
              <button
                type="button"
                onClick={() => setCreateForm((p) => ({ ...p, password: generateStrongPassword() }))}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Generate
              </button>
            </div>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
              value={createForm.password}
              onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Share this once. The member can change it later (via admin reset).
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Permissions</p>
            <div className="mt-3 space-y-4">
              {ADMIN_PERMISSION_GROUPS.map((group) => (
                <div key={group.key} className="space-y-2">
                  <p className="text-sm font-semibold">{group.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex items-start gap-2 rounded-xl border border-border bg-white px-3 py-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={createForm.permissions.includes(item.key)}
                          onChange={() => togglePerm(item.key, "create")}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-white/90"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isLoading || !canManageTeam}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      <Modal title="Edit Team Member" isOpen={showEdit} onClose={() => setShowEdit(false)}>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Name</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Phone</label>
              <input
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground">Role preset</label>
              <select
                className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground"
                value={editForm.teamRole}
                onChange={(e) => {
                  const teamRole = e.target.value;
                  setEditForm((p) => ({ ...p, teamRole, permissions: getAdminRolePreset(teamRole) }));
                }}
              >
                {teamRoleOptions.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={editForm.active}
                  onChange={(e) => setEditForm((p) => ({ ...p, active: e.target.checked }))}
                />
                Active
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground">Reset password (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground"
              value={editForm.password}
              onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="Leave blank to keep current password"
            />
          </div>

          <div className="rounded-2xl border border-border bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">Permissions</p>
            <div className="mt-3 space-y-4">
              {ADMIN_PERMISSION_GROUPS.map((group) => (
                <div key={group.key} className="space-y-2">
                  <p className="text-sm font-semibold">{group.title}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map((item) => (
                      <label key={item.key} className="flex items-start gap-2 rounded-xl border border-border bg-white px-3 py-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={editForm.permissions.includes(item.key)}
                          onChange={() => togglePerm(item.key, "edit")}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{item.label}</span>
                          <span className="block text-xs text-muted-foreground">{item.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowEdit(false)}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-white/90"
            >
              Cancel
            </button>
            <button
              onClick={handleEditSave}
              disabled={isLoading || !canManageTeam}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      <Modal title="Delete Team Member" isOpen={showDelete} onClose={() => setShowDelete(false)}>
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{deleteTarget?.name}</span>? This cannot be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowDelete(false)}
              className="rounded-xl border border-border bg-white px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-white/90"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={isLoading || !canManageTeam}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
