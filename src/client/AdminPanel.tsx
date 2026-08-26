import React, { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ApiError, api } from "./api";
import { formatStorageBytes } from "./storage";
import type { AdminUser, Report } from "./types";

const DECIMAL_GB = 1_000_000_000;

function shortUserId(userId: string): string {
  return userId.length > 24 ? `${userId.slice(0, 14)}…${userId.slice(-7)}` : userId;
}

function usagePercent(user: AdminUser): number {
  return Math.min(100, user.usedBytes / Math.max(1, user.effectiveQuotaBytes) * 100);
}

export default function AdminPanel({ report }: { report: Report }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [promotionGb, setPromotionGb] = useState("10");
  const [promotionError, setPromotionError] = useState("");
  const [submittingUserId, setSubmittingUserId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const nextUsers = await api<AdminUser[]>("/api/admin/users");
      setUsers(Array.isArray(nextUsers) ? nextUsers : []);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "Administrator access is required." : cause instanceof Error ? cause.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, []);

  const totals = useMemo(() => users.reduce((summary, user) => ({
    users: summary.users + 1,
    uploads: summary.uploads + user.uploadCount,
    uploadBytes: summary.uploadBytes + user.uploadBytes,
    quotaBytes: summary.quotaBytes + user.effectiveQuotaBytes,
    promotionBytes: summary.promotionBytes + user.promotionBytes,
  }), { users: 0, uploads: 0, uploadBytes: 0, quotaBytes: 0, promotionBytes: 0 }), [users]);

  async function promote(user: AdminUser) {
    const gigabytes = Number(promotionGb);
    const additionalBytes = Math.round(gigabytes * DECIMAL_GB);
    if (!Number.isFinite(gigabytes) || gigabytes <= 0 || !Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) {
      setPromotionError("Enter a positive storage amount in GB.");
      return;
    }
    setPromotionError("");
    setSubmittingUserId(user.userId);
    try {
      await api("/api/admin/promotions", {
        method: "POST",
        body: JSON.stringify({ userId: user.userId, additionalBytes, reason: "Admin promotion" }),
      });
      setOpenUserId(null);
      report(`${formatStorageBytes(additionalBytes)} promoted to ${shortUserId(user.userId)}.`);
      await loadUsers();
    } catch (cause) {
      setPromotionError(cause instanceof Error ? cause.message : "Promotion could not be applied.");
    } finally {
      setSubmittingUserId(null);
    }
  }

  return <section className="admin-panel">
    <header className="admin-header">
      <div>
        <div className="eyebrow admin-eyebrow"><ShieldCheck size={14} className="text-blue" /> Admin</div>
        <h1 className="font-display text-[28px] leading-8 md:text-[30px]">Users</h1>
      </div>
      <button type="button" className="icon-btn" onClick={() => void loadUsers()} disabled={loading} aria-label="Refresh users">
        <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
      </button>
    </header>

    <div className="admin-summary" aria-label="Account totals">
      <div className="admin-stat"><span className="admin-stat-label">Users</span><strong>{totals.users}</strong></div>
      <div className="admin-stat"><span className="admin-stat-label">Uploads</span><strong>{totals.uploads}</strong><small>{formatStorageBytes(totals.uploadBytes)}</small></div>
      <div className="admin-stat"><span className="admin-stat-label">Quota</span><strong>{formatStorageBytes(totals.quotaBytes)}</strong><small>{formatStorageBytes(totals.promotionBytes)} promoted</small></div>
    </div>

    {error && <div className="admin-error"><span>{error}</span><button type="button" className="btn-quiet !px-0" onClick={() => void loadUsers()}>Try again</button></div>}
    {!error && loading && !users.length && <div className="admin-state"><LoaderCircle size={18} className="animate-spin" /> Loading…</div>}
    {!error && !loading && !users.length && <div className="empty-state"><div className="font-display text-[21px] leading-7">No users</div></div>}

    {!!users.length && <section className="admin-users" aria-label="Users">
      <div className="admin-user-list-head" aria-hidden="true">
        <span>User</span><span>Uploads</span><span>Quota</span><span>Promotion</span><span />
      </div>
      {users.map(user => <div className="admin-user-entry" key={user.userId}>
        <div className="admin-user-row">
          <div className="admin-user-identity">
            <span className="admin-field-label">User</span>
            <span className="admin-user-id" title={user.userId}>{shortUserId(user.userId)}</span>
            <span className="admin-user-plan">{user.plan.name} plan</span>
          </div>
          <div className="admin-user-cell">
            <span className="admin-field-label">Uploads</span>
            <strong>{formatStorageBytes(user.uploadBytes)}</strong>
            <span className="admin-cell-note">{user.uploadCount} {user.uploadCount === 1 ? "item" : "items"}{user.reservedBytes ? ` · ${formatStorageBytes(user.reservedBytes)} pending` : ""}</span>
          </div>
          <div className="admin-user-cell admin-quota">
            <span className="admin-field-label">Quota</span>
            <div className="admin-quota-line"><strong>{formatStorageBytes(user.usedBytes)}</strong><span>of {formatStorageBytes(user.effectiveQuotaBytes)}</span></div>
            <div className="admin-quota-track" role="progressbar" aria-label={`Storage used by ${shortUserId(user.userId)}`} aria-valuemin={0} aria-valuemax={user.effectiveQuotaBytes} aria-valuenow={Math.min(user.usedBytes, user.effectiveQuotaBytes)}><span style={{ width: `${usagePercent(user)}%` }} /></div>
          </div>
          <div className="admin-user-cell">
            <span className="admin-field-label">Promotion</span>
            <strong>{user.promotionBytes ? `+${formatStorageBytes(user.promotionBytes)}` : "—"}</strong>
            <span className="admin-cell-note">{user.promotionBytes ? "active" : "none"}</span>
          </div>
          <div className="admin-action-cell">
            <button type="button" className={`admin-promote-button ${openUserId === user.userId ? "is-open" : ""}`} onClick={() => { setOpenUserId(openUserId === user.userId ? null : user.userId); setPromotionError(""); }} aria-expanded={openUserId === user.userId}>
              <Plus size={15} /> Promote
            </button>
          </div>
        </div>
        {openUserId === user.userId && <form className="admin-promotion" onSubmit={event => { event.preventDefault(); void promote(user); }}>
          <div className="admin-promotion-copy">
            <div className="eyebrow !mb-0">Promotion</div>
            <strong>Increase quota</strong>
          </div>
          <div className="admin-promotion-controls">
            <div className="admin-amount"><label htmlFor={`promotion-${user.userId}`}>Storage</label><div><input id={`promotion-${user.userId}`} type="number" min="0.1" step="0.1" value={promotionGb} onChange={event => setPromotionGb(event.target.value)} /><span>GB</span></div></div>
            <div className="admin-quick"><span>Quick add</span><div>{[1, 5, 10, 25].map(value => <button key={value} type="button" onClick={() => setPromotionGb(String(value))}>{value} GB</button>)}</div></div>
            <button type="submit" className="btn-primary admin-apply" disabled={submittingUserId === user.userId}>{submittingUserId === user.userId ? <LoaderCircle size={16} className="animate-spin" /> : <Check size={16} />} {submittingUserId === user.userId ? "Applying…" : "Add storage"}</button>
          </div>
          <button type="button" className="admin-cancel" onClick={() => setOpenUserId(null)} aria-label="Close promotion form"><X size={17} /></button>
          {promotionError && <div className="admin-promotion-error">{promotionError}</div>}
        </form>}
      </div>)}
    </section>}
  </section>;
}
