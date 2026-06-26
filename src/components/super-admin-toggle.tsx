import { useState } from "react";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ShieldCheck } from "lucide-react";

export function SuperAdminToggle() {
  const { isSuper, enable, disable } = useSuperAdmin();
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState("");

  if (isSuper) {
    return (
      <Button size="sm" variant="default" onClick={disable} className="gap-1">
        <ShieldCheck className="h-4 w-4" /> Admin: Manish
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1">
        <Shield className="h-4 w-4" /> Admin
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Super admin sign in</DialogTitle>
          <DialogDescription>Enter the admin password to unlock full control.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await enable(pwd)) {
              setOpen(false);
              setPwd("");
            }
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="spwd">Password</Label>
            <Input id="spwd" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button type="submit">Unlock</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}