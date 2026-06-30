"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type Customer = {
  id: string;
  companyName: string;
};

export default function TranslationCreate() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [tableName, setTableName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      try {
        const res = await fetch("/api/customers");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (!cancelled) setCustomers(data);
      } catch {}
    };
    fetchCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileUpload = (file: File | null) => {
    if (!file) return;
    setMessage("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) return;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: "" });
        if (json.length === 0) {
          setMessage("No data found in the Excel file");
          return;
        }
        setHeaders(Object.keys(json[0]));
        setRows(json);
        setTableName(file.name.replace(/\.[^/.]+$/, ""));
      } catch {
        setMessage("Failed to parse Excel file");
      }
    };
    reader.readAsBinaryString(file);
  };

  const saveTable = async () => {
    if (!tableName.trim()) {
      setMessage("Table name is required");
      return;
    }
    if (rows.length === 0) {
      setMessage("Upload an Excel file first");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          customerId: customerId || null,
          headers,
          rows,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage("Translation table saved successfully");
      setHeaders([]);
      setRows([]);
      setTableName("");
      setCustomerId("");
    } catch {
      setMessage("Failed to save translation table");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 lg:p-10">
      <div className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[var(--shadow-sm)]">
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">Create Translation Table</h2>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes("successfully") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-[var(--destructive)] border border-red-200"}`}>
            {message}
          </div>
        )}

        <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center hover:border-[var(--primary)]/40 transition-colors">
          <p className="text-sm text-[var(--foreground)]/60 mb-3">Drag .xlsx file here or</p>
          <label className="inline-block px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors cursor-pointer">
            Choose File
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {rows.length > 0 && (
          <>
            <div className="mt-6 overflow-x-auto border border-[var(--border)] rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-[var(--muted)] text-[var(--foreground)]/70">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.slice(0, 10).map((row, idx) => (
                    <tr key={idx}>
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <p className="px-3 py-2 text-xs text-[var(--foreground)]/50">...and {rows.length - 10} more rows</p>
              )}
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Table Name</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Customer</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3.5 py-2 border border-[var(--border)] rounded-lg text-sm bg-white text-[var(--foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 outline-none"
                >
                  <option value="">Public</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={saveTable}
                disabled={saving}
                className="px-5 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-all cursor-pointer"
              >
                {saving ? "Saving..." : "Save Translation Table"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
