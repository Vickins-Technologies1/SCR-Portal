"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench, ClipboardCheck, PlusCircle, X } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbTask } from "@/types/airbnb";

export default function AirbnbOperationsPage() {
  const { hasAccess, ownerId, csrfToken } = useAirbnbAccess("expenses:view");
  const [tasks, setTasks] = useState<AirbnbTask[]>([]);
  const [listingOptions, setListingOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [taskMessage, setTaskMessage] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    propertyName: "",
    dueDate: "",
    assignedTo: "",
    checklist: "",
  });

  const fetchTasks = useCallback(async () => {
    if (!ownerId) return;
    setIsLoading(true);
    const res = await fetch(`/api/airbnb/operations?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setTasks(data.tasks || []);
    }
    setIsLoading(false);
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchTasks();
    }
  }, [hasAccess, fetchTasks]);

  const fetchListings = useCallback(async () => {
    if (!ownerId) return;
    const res = await fetch(`/api/airbnb/listings?ownerId=${ownerId}`, { credentials: "include" });
    const data = await res.json();
    if (data.success) {
      setListingOptions((data.listings || []).map((listing: any) => listing.name));
    }
  }, [ownerId]);

  useEffect(() => {
    if (hasAccess) {
      fetchListings();
    }
  }, [hasAccess, fetchListings]);

  const handleCreateTask = async () => {
    if (!csrfToken) {
      setTaskMessage("Missing session token. Refresh and try again.");
      return;
    }
    if (!taskForm.title || !taskForm.propertyName || !taskForm.dueDate || !taskForm.assignedTo) {
      setTaskMessage("Fill in task title, property, assignee, and due date.");
      return;
    }

    setIsSaving(true);
    setTaskMessage(null);
    try {
      const res = await fetch("/api/airbnb/operations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          title: taskForm.title,
          propertyName: taskForm.propertyName,
          dueDate: taskForm.dueDate,
          assignedTo: taskForm.assignedTo,
          checklist: taskForm.checklist
            ? taskForm.checklist.split(",").map((item) => item.trim()).filter(Boolean)
            : [],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to create task");
      }
      setTaskForm({ title: "", propertyName: "", dueDate: "", assignedTo: "", checklist: "" });
      setShowTaskModal(false);
      await fetchTasks();
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setIsSaving(false);
    }
  };

  const updateTaskStatus = async (taskId: string, status: AirbnbTask["status"]) => {
    if (!csrfToken) {
      setTaskMessage("Missing session token. Refresh and try again.");
      return;
    }
    try {
      const res = await fetch("/api/airbnb/operations", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ id: taskId, status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to update task");
      }
      await fetchTasks();
    } catch (err) {
      setTaskMessage(err instanceof Error ? err.message : "Failed to update task");
    }
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <SectionHeader
            eyebrow="Airbnb Module"
            title="Operations & Team"
            subtitle="Auto-generate cleaning tasks, assign staff, and track inventory."
            icon={Wrench}
            actions={
              <button
                onClick={() => {
                  setTaskMessage(null);
                  setShowTaskModal(true);
                }}
                className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold"
              >
                <PlusCircle size={16} />
                New task
              </button>
            }
          />

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="surface-card rounded-3xl p-5 sm:p-6">
              <h2 className="text-sm sm:text-base font-semibold text-foreground mb-4">Upcoming tasks</h2>
              {isLoading ? (
                <div className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="rounded-2xl border border-border bg-white/70 px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-foreground">{task.title}</p>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            task.status === "done"
                              ? "bg-emerald-100 text-emerald-700"
                              : task.status === "in_progress"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {task.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{task.propertyName}</p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                        <span>Assigned to {task.assignedTo}</span>
                        <span>
                          Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {task.checklist.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <h2 className="text-sm sm:text-base font-semibold text-foreground">Inventory snapshot</h2>
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                <div className="flex items-center justify-between">
                  <span>Fresh linens</span>
                  <span className="font-semibold text-foreground">48 sets</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Toiletries kits</span>
                  <span className="font-semibold text-foreground">120 kits</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Replacement bulbs</span>
                  <span className="font-semibold text-foreground">22 units</span>
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-white/70 px-4 py-4 text-xs text-muted-foreground space-y-2">
                <p className="font-semibold text-foreground">Smart lock readiness</p>
                <p>• 2 properties ready for lock integration.</p>
                <p>• 1 property awaiting hardware install.</p>
              </div>
              <button
                onClick={() => setShowReviewModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
              >
                <ClipboardCheck size={14} />
                Review checklists
              </button>
            </div>
          </section>

          {showTaskModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-lg overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Create task</h2>
                    <p className="text-[11px] text-muted-foreground">Assign a cleaner or staff member.</p>
                  </div>
                  <button onClick={() => setShowTaskModal(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-4">
                  {taskMessage && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {taskMessage}
                    </div>
                  )}
                  <input
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Task title"
                    value={taskForm.title}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                  <select
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={taskForm.propertyName}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, propertyName: event.target.value }))}
                  >
                    <option value="">Select property</option>
                    {listingOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    value={taskForm.dueDate}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Assigned to"
                    value={taskForm.assignedTo}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, assignedTo: event.target.value }))}
                  />
                  <input
                    className="w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm"
                    placeholder="Checklist items (comma separated)"
                    value={taskForm.checklist}
                    onChange={(event) => setTaskForm((prev) => ({ ...prev, checklist: event.target.value }))}
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowTaskModal(false)}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTask}
                      disabled={isSaving}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Create task"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showReviewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop p-4">
              <div className="modal-panel w-full max-w-2xl overflow-hidden">
                <div className="modal-header flex items-center justify-between px-5 py-4">
                  <div>
                    <h2 className="text-base font-semibold text-foreground">Review checklists</h2>
                    <p className="text-[11px] text-muted-foreground">Update task status quickly.</p>
                  </div>
                  <button onClick={() => setShowReviewModal(false)} className="modal-close rounded-full p-1">
                    <X size={18} />
                  </button>
                </div>
                <div className="modal-body modal-stagger space-y-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-2xl border border-border bg-white/70 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{task.title}</p>
                          <p className="text-[11px] text-muted-foreground">{task.propertyName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.status !== "in_progress" && (
                            <button
                              onClick={() => updateTaskStatus(task.id, "in_progress")}
                              className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700"
                            >
                              In progress
                            </button>
                          )}
                          {task.status !== "done" && (
                            <button
                              onClick={() => updateTaskStatus(task.id, "done")}
                              className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"
                            >
                              Mark done
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {task.checklist.map((item) => (
                          <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
