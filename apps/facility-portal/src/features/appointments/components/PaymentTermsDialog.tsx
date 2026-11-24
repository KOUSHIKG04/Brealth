"use client";

import { Info } from "lucide-react";
import { Button } from "@startup/web-ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@startup/web-ui/components/ui/dialog";

export function PaymentTermsDialog({ text }: { text: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-primary h-auto min-h-11 gap-2 px-0 text-sm"
        >
          <Info aria-hidden className="size-4 shrink-0" />
          Payment &amp; refund terms
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Payment &amp; refund terms</DialogTitle>
        <DialogDescription>
          Review these terms with the patient before collecting payment.
        </DialogDescription>
        <p className="text-foreground text-sm leading-6 [overflow-wrap:anywhere]">
          {text}
        </p>
      </DialogContent>
    </Dialog>
  );
}
