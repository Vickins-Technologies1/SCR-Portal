"use client";

import React from "react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

export default function SettingsPage() {
  return (
    <div className="flex min-h-screen bg-gray-100">
       <Navbar />
      <Sidebar />
      <main className="flex-1 p-6 ml-0 sm:ml-64">
        <h1 className="text-2xl font-semibold text-[#0a0a23] mb-6">
          Settings
        </h1>
        <div className="bg-white p-6 rounded-md shadow-md border border-gray-200">
          <p className="text-gray-700">
            This is the Settings page. Add your settings content here.
          </p>
        </div>
      </main>
    </div>
  );
}