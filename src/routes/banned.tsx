import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BannedScreen } from "@/components/banned-screen";
import type { MyBan } from "@/hooks/use-my-ban";

export const Route = createFileRoute("/banned")({
  ssr: false,
  head: () => ({ meta: [{ title: "Access Denied — Hub Community" }] }),
  component: BannedPage,
});

function BannedPage() {
  const [ban, setBan] = useState<MyBan | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("hub:bannedInfo");
      if (raw) setBan(JSON.parse(raw));
    } catch {}
  }, []);
  if (!ban) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground text-sm">
            Your account is banned from the Hub Community. If you believe this is a mistake, email{" "}
            <a className="text-primary underline" href="mailto:m81434409@gmail.com">
              m81434409@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }
  return <BannedScreen ban={ban} />;
}