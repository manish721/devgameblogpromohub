import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert, ShieldCheck, Search, UserX, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/bans")({
  component: AdminBansPage,
});

type BanRow = {
  id: string;
  user_id: string;
  reason: string;
  banned_by: string | null;
  started_at: string;
  ends_at: string;
  status: string;
  effective_status: "active" | "expired" | "removed";
  user: { id: string; username: string; display_name: string | null } | null;
  admin: { id: string; username: string; display_name: string | null } | null;
};

type UserRow = { id: string; username: string; display_name: string | null };

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  if (ms === 0) return <span className="text-xs text-muted-foreground">expired</span>;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms / 3600000) % 24);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  return (
    <span className="text-xs tabular-nums text-muted-foreground">
      {d}d {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

function AdminBansPage() {
  const { isSuper, enable, call } = useSuperAdmin();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwd, setPwd] = useState("");

  useEffect(() => {
    if (!isSuper) setPwdOpen(true);
  }, [isSuper]);

  if (!isSuper) {
    return (
      <Dialog open={pwdOpen} onOpenChange={setPwdOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin password required</DialogTitle>
            <DialogDescription>Enter the administrator password to manage bans.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await enable(pwd);
              if (ok) setPwdOpen(false);
            }}
            className="space-y-4"
          >
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
            <DialogFooter>
              <Button type="submit">Unlock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  return <BansConsole call={call} />;
}

function BansConsole({ call }: { call: ReturnType<typeof useSuperAdmin>["call"] }) {
  const [bans, setBans] = useState<BanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "expired" | "removed" | "all">("active");
  const [search, setSearch] = useState("");
  const [banOpen, setBanOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await call<{ ok: boolean; bans: BanRow[] }>({ type: "listBans" });
    setBans(res?.bans ?? []);
    setLoading(false);
  }, [call]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bans.filter((b) => {
      if (tab !== "all" && b.effective_status !== tab) return false;
      if (!q) return true;
      return (
        b.user?.username?.toLowerCase().includes(q) ||
        b.user?.display_name?.toLowerCase().includes(q) ||
        b.reason?.toLowerCase().includes(q)
      );
    });
  }, [bans, tab, search]);

  const counts = useMemo(() => {
    const c = { active: 0, expired: 0, removed: 0 };
    for (const b of bans) c[b.effective_status]++;
    return c;
  }, [bans]);

  async function unban(banId: string) {
    const ok = await call({ type: "unbanUser", banId });
    if (ok) {
      toast.success("Ban removed");
      void load();
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" /> Ban management
          </h1>
          <p className="text-sm text-muted-foreground">Issue 7-day bans, review history, and remove bans early.</p>
        </div>
        <Button onClick={() => setBanOpen(true)}>
          <UserX className="h-4 w-4 mr-2" /> Ban a user
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(["active", "expired", "removed", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-xs rounded-full px-3 py-1 border transition ${
              tab === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
            }`}
          >
            {k[0].toUpperCase() + k.slice(1)}
            {k !== "all" && <span className="ml-1 opacity-70">({counts[k]})</span>}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8 w-64"
            placeholder="Search users or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading bans…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No bans in this view.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((b) => (
              <div key={b.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium">
                    {b.user?.display_name || b.user?.username || b.user_id.slice(0, 8)}
                  </div>
                  <div className="text-xs text-muted-foreground">@{b.user?.username ?? "unknown"}</div>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="text-sm">{b.reason || <span className="text-muted-foreground">No reason</span>}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmt(b.started_at)} → {fmt(b.ends_at)}
                  </div>
                </div>
                <div className="min-w-[130px]">
                  {b.effective_status === "active" ? (
                    <>
                      <Badge variant="destructive">Active</Badge>
                      <div className="mt-1">
                        <Countdown endsAt={b.ends_at} />
                      </div>
                    </>
                  ) : b.effective_status === "expired" ? (
                    <Badge variant="secondary">Expired</Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> Removed
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground min-w-[120px]">
                  by @{b.admin?.username ?? "system"}
                </div>
                <div>
                  {b.effective_status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => unban(b.id)}>
                      <RotateCcw className="h-3 w-3 mr-1" /> Unban
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BanUserDialog
        open={banOpen}
        onOpenChange={setBanOpen}
        call={call}
        onDone={() => {
          void load();
          setBanOpen(false);
        }}
      />
    </div>
  );
}

function BanUserDialog({
  open,
  onOpenChange,
  call,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  call: ReturnType<typeof useSuperAdmin>["call"];
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [picked, setPicked] = useState<UserRow | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setUsers([]);
      setPicked(null);
      setReason("");
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) return setUsers([]);
      const res = await call<{ ok: boolean; users: UserRow[] }>({ type: "findUser", query: q });
      setUsers(res?.users ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [q, call]);

  async function submit() {
    if (!picked) return;
    setSaving(true);
    const ok = await call({ type: "banUser", userId: picked.id, reason: reason.trim() });
    setSaving(false);
    if (ok) {
      toast.success(`Banned ${picked.username} for 7 days`);
      onDone();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban a user for 7 days</DialogTitle>
          <DialogDescription>The user will lose access to the entire Hub Community.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Find user</Label>
            <Input placeholder="Search by username or display name…" value={q} onChange={(e) => setQ(e.target.value)} />
            {users.length > 0 && !picked && (
              <div className="border rounded max-h-48 overflow-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setPicked(u)}
                    className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                  >
                    <div className="font-medium">{u.display_name || u.username}</div>
                    <div className="text-xs text-muted-foreground">@{u.username}</div>
                  </button>
                ))}
              </div>
            )}
            {picked && (
              <div className="flex items-center justify-between rounded border p-2 bg-muted/40">
                <div className="text-sm">
                  <div className="font-medium">{picked.display_name || picked.username}</div>
                  <div className="text-xs text-muted-foreground">@{picked.username}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                  Change
                </Button>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="Why is this user being banned?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!picked || saving} onClick={submit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserX className="h-4 w-4 mr-2" />}
            Ban for 7 days
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}