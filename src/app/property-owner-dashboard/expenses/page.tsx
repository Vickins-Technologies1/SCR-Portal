// src/app/property-owner-dashboard/expenses/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import {
  Receipt,
  PlusCircle,
  DollarSign,
  Wrench,
  Lightbulb,
  Hammer,
  FileText,
  AlertCircle,
  Calendar,
} from "lucide-react";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import { Inter } from "next/font/google";
import { format } from "date-fns";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

interface Expense {
  _id: string;
  description: string;
  amount: number;
  category: "maintenance" | "utilities" | "repairs" | "taxes" | "management" | "other";
  date: string;
  propertyName?: string;
}

export default function ExpensesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const fetchExpenses = useCallback(async () => {
    if (!userId || !csrfToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/expenses?ownerId=${userId}&period=year`, {
        headers: { "x-csrf-token": csrfToken },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        setExpenses(data.expenses || []);
      } else {
        throw new Error(data.message || "Failed");
      }
    } catch (err) {
      setError("Failed to load expenses.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, csrfToken]);

  useEffect(() => {
    if (userId && csrfToken) fetchExpenses();
  }, [userId, csrfToken, fetchExpenses]);

  // Quick stats (computed client-side for simplicity; move to backend later)
  const totalThisYear = expenses.reduce((sum, e) => sum + e.amount, 0);
  const categoryTotals = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {} as Record<string, number>);

  const categoryIcons = {
    maintenance: Wrench,
    utilities: Lightbulb,
    repairs: Hammer,
    taxes: FileText,
    management: DollarSign,
    other: Receipt,
  };

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8 mt-6">
            <div className="flex items-center gap-3">
              <Receipt className="h-8 w-8 text-emerald-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Expenses</h1>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl shadow-lg transition-all"
            >
              <PlusCircle size={18} />
              Add Expense
            </motion.button>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 text-red-700 px-5 py-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white/80 rounded-2xl h-32 shadow-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-gray-600">Total This Year</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    Ksh {totalThisYear.toLocaleString()}
                  </p>
                </div>
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 shadow-lg">
                  <p className="text-sm font-medium text-gray-600">Avg per Month</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    Ksh {(totalThisYear / 12).toFixed(0).toLocaleString()}
                  </p>
                </div>
                {/* Add more derived stats if needed */}
              </div>

              {/* Category Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
                {Object.entries(categoryTotals).map(([cat, amt]) => {
                  const Icon = categoryIcons[cat as keyof typeof categoryIcons] || Receipt;
                  return (
                    <div key={cat} className="bg-white/80 rounded-2xl p-5 shadow-lg text-center">
                      <Icon className="h-8 w-8 mx-auto text-emerald-600 mb-3" />
                      <p className="text-sm font-medium text-gray-600 capitalize">{cat}</p>
                      <p className="text-xl font-bold text-gray-900 mt-1">
                        Ksh {amt.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Expense List */}
              <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">Recent Expenses</h2>
                </div>
                {expenses.length === 0 ? (
                  <div className="text-center py-20">
                    <Receipt className="h-16 w-16 mx-auto text-gray-300 mb-6" />
                    <p className="text-xl font-semibold text-gray-700">No expenses recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {expenses.slice(0, 15).map((exp) => (  // limit for performance; add pagination later
                      <div
                        key={exp._id}
                        className="p-6 hover:bg-gray-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{exp.description}</p>
                          {exp.propertyName && (
                            <p className="text-sm text-gray-600 mt-1">{exp.propertyName}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-red-600">
                            -Ksh {exp.amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500 mt-1 flex items-center justify-end gap-1.5">
                            <Calendar size={14} />
                            {format(new Date(exp.date), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}