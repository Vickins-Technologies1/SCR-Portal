"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench, ClipboardCheck, PlusCircle } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import SectionHeader from "../components/SectionHeader";
import { useAirbnbAccess } from "../components/useAirbnbAccess";
import type { AirbnbTask } from "@/types/airbnb";

export default function AirbnbOperationsPage() {
  const { hasAccess, ownerId } = useAirbnbAccess("expenses:view");
  const [tasks, setTasks] = useState<AirbnbTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
              <button className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-xl shadow-lg shadow-primary/30 hover:bg-primary-hover transition-all text-xs sm:text-sm font-semibold">
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
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                <ClipboardCheck size={14} />
                Review checklists
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
