import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { superAdmin } from "@/lib/superadmin.functions";
import { toast } from "sonner";

type Ctx = {
  isSuper: boolean;
  enable: (password: string) => Promise<boolean>;
  disable: () => void;
  run: (action: Parameters<typeof superAdmin>[0]["data"]["action"]) => Promise<boolean>;
  call: <T = unknown>(action: Parameters<typeof superAdmin>[0]["data"]["action"]) => Promise<T | null>;
};

const KEY = "dgbpc:super";
const TOKEN_KEY = "dgbpc:super:token";
const EXP_KEY = "dgbpc:super:exp";

function readToken(): string | null {
  if (typeof window === "undefined") return null;
  const t = sessionStorage.getItem(TOKEN_KEY);
  const exp = Number(sessionStorage.getItem(EXP_KEY) ?? 0);
  if (!t || !exp || exp < Date.now()) return null;
  return t;
}
function clearToken() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXP_KEY);
}

const C = createContext<Ctx>({
  isSuper: false,
  enable: async () => false,
  disable: () => {},
  run: async () => false,
  call: async () => null,
});

export function SuperAdminProvider({ children }: { children: ReactNode }) {
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    if (readToken()) setIsSuper(true);
    else clearToken();
  }, []);

  const enable = useCallback(async (password: string) => {
    try {
      const res = (await superAdmin({
        data: { password, action: { type: "signIn" } },
      })) as { ok: boolean; token: string; exp: number };
      sessionStorage.setItem(KEY, "1");
      sessionStorage.setItem(TOKEN_KEY, res.token);
      sessionStorage.setItem(EXP_KEY, String(res.exp));
      setIsSuper(true);
      toast.success("Super admin mode ON");
      return true;
    } catch (e) {
      const msg = (e as Error).message ?? "";
      toast.error(msg.includes("Unauthorized") ? "Please sign in first" : "Wrong password");
      return false;
    }
  }, []);

  const disable = useCallback(() => {
    clearToken();
    setIsSuper(false);
  }, []);

  const handleErr = useCallback((e: unknown) => {
    const msg = (e as Error).message ?? "Action failed";
    if (msg.includes("Admin session")) {
      clearToken();
      setIsSuper(false);
    }
    toast.error(msg);
  }, []);

  const run = useCallback<Ctx["run"]>(async (action) => {
    const token = readToken() ?? "";
    try {
      await superAdmin({ data: { token, action } });
      return true;
    } catch (e) {
      handleErr(e);
      return false;
    }
  }, [handleErr]);

  const call = useCallback(async <T,>(action: Parameters<typeof superAdmin>[0]["data"]["action"]): Promise<T | null> => {
    const token = readToken() ?? "";
    try {
      return (await superAdmin({ data: { token, action } })) as T;
    } catch (e) {
      handleErr(e);
      return null;
    }
  }, [handleErr]);

  return <C.Provider value={{ isSuper, enable, disable, run, call }}>{children}</C.Provider>;
}

export const useSuperAdmin = () => useContext(C);