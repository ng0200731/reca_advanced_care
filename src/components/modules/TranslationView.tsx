"use client";

import { useEffect, useState } from "react";

type TranslationTable = {
  id: string;
  name: string;
  customerId: string | null;
  customer: { companyName: string } | null;
  headers: string;
  _count: { entries: number };
};

export default function TranslationView() {
  const [tables, setTables] = useState<TranslationTable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchTables = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/translations");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (!cancelled) setTables(data);
      } catch {
        if (!cancelled) setError("Failed to load translation tables");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTables();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const deleteTable = async (id: string) => {
    if (!confirm("Delete this translation table?")) return;
    try {
      const res = await fetch(`/api/translations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setTables(tables.filter((t) => t.id !== id));
    } catch {
      setError("Failed to delete translation table");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">Translation Tables</h2>
          <p className="text-sm text-[var(--foreground)]/50 mt-1">View and delete translation tables</p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-all cursor-pointer"
        >
          {loading ? "Loading..." : "Refresh List"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-[var(--destructive)]">
          {error}
        </div>
      )}

      {tables.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white border border-[var(--border)] rounded-xl">
          <p className="text-lg font-medium text-[var(--foreground)]">No translation tables yet</p>
          <p className="text-sm text-[var(--foreground)]/50 mt-1">Create a translation table first</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-[var(--foreground)]/70">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Table Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Customer</th>
                  <th className="px-4 py-3 text-left font-semibold">Rows</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {tables.map((t) => (
                  <tr key={t.id} className="hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{t.name}</td>
                    <td className="px-4 py-3">{t.customer?.companyName || "Public"}</td>
                    <td className="px-4 py-3">{t._count.entries}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteTable(t.id)}
                        className="px-3 py-1.5 text-xs font-medium border border-red-200 text-[var(--destructive)] rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
