"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  companyName: string;
};

export default function FontCreate() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

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

  const handleUpload = async () => {
    if (!file) {
      setMessage("Please select a font file");
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["ttf", "otf"].includes(ext)) {
      setMessage("Only .ttf and .otf files are allowed");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (customerId) formData.append("customerId", customerId);
      const res = await fetch("/api/fonts", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Failed");
      setMessage("Font uploaded successfully");
      setFile(null);
      setCustomerId("");
    } catch {
      setMessage("Failed to upload font");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 lg:p-10">
      <div className="bg-white border border-[var(--border)] rounded-xl p-6 shadow-[var(--shadow-sm)]">
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-6">Upload Font</h2>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.includes("successfully") ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-[var(--destructive)] border border-red-200"}`}>
            {message}
          </div>
        )}

        <div className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 text-center hover:border-[var(--primary)]/40 transition-colors">
          <p className="text-sm text-[var(--foreground)]/60 mb-3">Drag font files here (.ttf, .otf) or</p>
          <label className="inline-block px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 transition-colors cursor-pointer">
            Choose Files
            <input
              type="file"
              accept=".ttf,.otf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && <p className="mt-3 text-sm text-[var(--foreground)]/70">Selected: {file.name}</p>}
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-[var(--foreground)]/80 mb-1.5">Assign to Customer (optional)</label>
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

        <div className="mt-6">
          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="px-5 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--primary)]/90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {uploading ? "Uploading..." : "Upload to Database"}
          </button>
        </div>
      </div>
    </div>
  );
}
