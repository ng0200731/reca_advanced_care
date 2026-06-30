"use client";

import { useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
};

type Customer = {
  id: string;
  customerCode: string;
  companyName: string;
  companyType: string | null;
  emailDomain: string | null;
  address: string | null;
  notes: string | null;
  members: Member[];
};

export default function CustomerView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/customers");
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) setCustomers(data);
      } catch {
        if (!cancelled) setError("Failed to load customers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchCustomers();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const deleteCustomer = async (id: string) => {
    if (!confirm("Delete this customer and all members?")) return;
    try {
      const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCustomers(customers.filter((c) => c.id !== id));
    } catch {
      setError("Failed to delete customer");
    }
  };

  const updateCustomer = async () => {
    if (!editing) return;
    try {
      const res = await fetch(`/api/customers/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: editing.companyName,
          emailDomain: editing.emailDomain,
          companyType: editing.companyType,
          address: editing.address,
          notes: editing.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setCustomers(customers.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(null);
    } catch {
      setError("Failed to update customer");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-[var(--foreground)]">Customers</h2>
          <p className="text-sm text-[var(--foreground)]/50 mt-1">View, edit and delete customers</p>
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

      {customers.length === 0 && !loading ? (
        <div className="text-center py-16 bg-white border border-[var(--border)] rounded-xl">
          <p className="text-lg font-medium text-[var(--foreground)]">No customers yet</p>
          <p className="text-sm text-[var(--foreground)]/50 mt-1">Create a customer first</p>
        </div>
      ) : (
        <div className="bg-white border border-[var(--border)] rounded-xl overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-[var(--foreground)]/70">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Customer ID</th>
                  <th className="px-4 py-3 text-left font-semibold">Company Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Email Domain</th>
                  <th className="px-4 py-3 text-left font-semibold">Members</th>
                  <th className="px-4 py-3 text-left font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-3 font-mono text-xs">{c.customerCode}</td>
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{c.companyName}</td>
                    <td className="px-4 py-3 capitalize">{c.companyType || "-"}</td>
                    <td className="px-4 py-3">{c.emailDomain || "-"}</td>
                    <td className="px-4 py-3">{c.members.length}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditing(c)}
                          className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteCustomer(c.id)}
                          className="px-3 py-1.5 text-xs font-medium border border-red-200 text-[var(--destructive)] rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-[var(--shadow-xl)] w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">Edit Customer</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={editing.companyName}
                  onChange={(e) => setEditing({ ...editing, companyName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Email Domain</label>
                <input
                  type="text"
                  value={editing.emailDomain || ""}
                  onChange={(e) => setEditing({ ...editing, emailDomain: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Type</label>
                <select
                  value={editing.companyType || ""}
                  onChange={(e) => setEditing({ ...editing, companyType: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                >
                  <option value="">Select type...</option>
                  <option value="buyer">Buyer</option>
                  <option value="agent">Agent</option>
                  <option value="factory">Factory</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Address</label>
                <input
                  type="text"
                  value={editing.address || ""}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Notes</label>
                <textarea
                  value={editing.notes || ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 border border-[var(--border)] text-[var(--foreground)]/70 rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={updateCustomer}
                className="px-5 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-all cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
