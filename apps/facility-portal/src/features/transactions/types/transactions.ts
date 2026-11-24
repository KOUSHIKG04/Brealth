import type { ReactNode } from "react";
import type { PortalTransactions } from "@startup/contracts";

export type TransactionsScreenProps = {
  initialPage?: PortalTransactions;
  paymentPanel?: ReactNode;
};
