import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { superAdmin } from "@/lib/superadmin.functions";
import { toast } from "sonner";

type Ctx = {
  isSuper: boolean;
  enable: (password: string) => Promise<boolean>;
  disable: () => void;
  run: (action: Parameters<typeof superAdmin>[0]["data"]["action"]) => Promise<boolean>;
};

const KEY = "dgbpc:super";
const PWD_KEY = "dgbpc:super:pwd";

const C = createContext<Ctx>({
  isSuper: false,
  enable: async () => false,
  disable: () => {},
  run: async () => false,
});

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem(KEY) === "1") {
      setIsSuper(true);
    }
  }, []);

  const enable = useCallback(async (password: string) => {
    // Verify against the server (requires Supabase auth + correct server-stored password).
    try {
      await superAdmin({ data: { password, action: { type: "noop" } as never } });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      // The "noop" action will throw "Unknown action" only after password + auth both pass.
      if (!msg.includes("Unknown action")) {
        toast.error(msg.includes("Unauthorized") ? "Please sign in first" : "Wrong password");
        return false;
      }
    }
    sessionStorage.setItem(KEY, "1");
    sessionStorage.setItem(PWD_KEY, password);
    setIsSuper(true);
    toast.success("Super admin mode ON");
    return true;
  }, []);

  const disable = useCallback(() => {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(PWD_KEY);
    setIsSuper(false);
  }, []);

  const run = useCallback<Ctx["run"]>(async (action) => {
    const password = sessionStorage.getItem(PWD_KEY) ?? "";
    try {
      await superAdmin({ data: { password, action } });
      return true;
    } catch (e) {
      toast.error((e as Error).message ?? "Action failed");
      return false;
    }
  }, []);

  return <C.Provider value={{ isSuper, enable, disable, run }}>{children}</C.Provider>;
}

export const useSuperAdmin = () => useContext(C);