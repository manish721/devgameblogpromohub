import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Mail, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import type { MyBan } from "@/hooks/use-my-ban";

function useCountdown(endsAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms / 3600000) % 24);
  const minutes = Math.floor((ms / 60000) % 60);
  const seconds = Math.floor((ms / 1000) % 60);
  return { ms, days, hours, minutes, seconds };
}

export function BannedScreen({ ban }: { ban: MyBan }) {
  const navigate = useNavigate();
  const { ms, days, hours, minutes, seconds } = useCountdown(ban.ends_at);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/10 p-4 animate-in fade-in">
      <div className="w-full max-w-xl rounded-2xl border border-destructive/40 bg-card shadow-2xl overflow-hidden">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-destructive/15 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-destructive font-semibold">Access Denied</div>
              <h1 className="text-2xl font-bold leading-tight">You are temporarily banned</h1>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Your account has been temporarily banned from the Hub Community.
          </p>

          <div className="rounded-xl border bg-muted/40 p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Remaining Ban Time</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { l: "Days", v: days },
                { l: "Hours", v: hours },
                { l: "Minutes", v: minutes },
                { l: "Seconds", v: seconds },
              ].map((x) => (
                <div key={x.l} className="rounded-lg bg-background border py-2">
                  <div className="text-2xl font-bold tabular-nums">{String(x.v).padStart(2, "0")}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{x.l}</div>
                </div>
              ))}
            </div>
            {ms === 0 && (
              <div className="mt-3 text-xs text-emerald-600">Ban expired — refresh to regain access.</div>
            )}
          </div>

          <div className="text-sm">
            <div className="font-medium">Reason</div>
            <div className="text-muted-foreground">{ban.reason?.trim() ? ban.reason : "Violation of community rules"}</div>
          </div>

          <p className="text-xs text-muted-foreground">
            Your ban will automatically expire after 7 days. If you believe this ban was issued in error, you may
            request a review by emailing{" "}
            <a href="mailto:m81434409@gmail.com" className="text-primary underline">
              m81434409@gmail.com
            </a>
            .
          </p>

          <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
            <li>Sending an email does not guarantee an unban.</li>
            <li>Early unbans are granted only in rare circumstances.</li>
            <li>If an administrator approves your request, your account may be unbanned early.</li>
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <a href="mailto:m81434409@gmail.com?subject=Ban%20Review%20Request">
                <Mail className="h-4 w-4 mr-2" /> Request review
              </a>
            </Button>
            <Button variant="outline" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}