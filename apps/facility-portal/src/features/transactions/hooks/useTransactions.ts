"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type {
  PortalTransactionCursor,
  PortalTransactions,
} from "@startup/contracts";
import { loadPortalTransactions } from "../server/actions";

export function useTransactions(initialPage?: PortalTransactions) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const query = useInfiniteQuery({
    queryKey: ["portal-transactions"],
    queryFn: ({ pageParam }) => loadPortalTransactions(pageParam),
    initialPageParam: null as PortalTransactionCursor | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    initialData: initialPage
      ? { pages: [initialPage], pageParams: [null] }
      : undefined,
    refetchInterval: 30000,
  });
  const needle = search.trim().toLowerCase();
  const rows = [
    ...new Map(
      (query.data?.pages.flatMap((page) => page.items) ?? []).map((item) => [
        item.id,
        item,
      ])
    ).values(),
  ];
  return {
    query,
    search,
    setSearch,
    status,
    setStatus,
    method,
    setMethod,
    loadedCount: rows.length,
    rows: rows.filter(
      (item) =>
        (status === "all" || item.status === status) &&
        (method === "all" || item.method === method) &&
        (!needle ||
          [
            item.patient_name,
            item.doctor_name,
            item.facility_name,
            item.appointment_reference,
            item.payment_id,
            item.order_id,
          ].some((value) => value?.toLowerCase().includes(needle)))
    ),
  };
}
