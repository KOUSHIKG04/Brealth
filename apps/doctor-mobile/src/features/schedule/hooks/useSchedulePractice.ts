import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@startup/mobile-ui";
import { listMyPractices } from "@startup/data-access";
import type { ClinicPractice } from "@startup/contracts";
import { supabase, useMobileSession } from "../../../services/supabase";
import {
  getSelectedPracticeId,
  setSelectedPracticeId,
} from "../../practices/services/selectedPractice";
import { selectedPracticeQueryKey } from "../../practices/utils/practiceQueryKeys";

/**
 * The practice the schedule overview works on. A choice is remembered, so the
 * service editors open on the same practice.
 */
export function useSchedulePractice() {
  const client = useQueryClient();
  const { showToast } = useToast();
  const { profile } = useMobileSession();
  const doctorId = profile?.doctor?.id;
  const practices = useQuery({
    queryKey: ["my-practices"],
    queryFn: () => listMyPractices(supabase!),
    enabled: Boolean(supabase),
  });
  const preferred = useQuery({
    queryKey: selectedPracticeQueryKey(doctorId),
    queryFn: () => getSelectedPracticeId(doctorId!),
    enabled: Boolean(doctorId),
  });
  const availablePractices = practices.data as ClinicPractice[] | undefined;
  const [practice, setPractice] = useState<string | null>(null);
  const selectedPractice =
    availablePractices?.find((p) => p.practice_id === practice) ??
    availablePractices?.find((p) => p.practice_id === preferred.data) ??
    availablePractices?.[0];

  function selectPractice(p: ClinicPractice) {
    setPractice(p.practice_id);
    if (doctorId)
      void setSelectedPracticeId(doctorId, p.practice_id)
        .then(() =>
          client.setQueryData(selectedPracticeQueryKey(doctorId), p.practice_id)
        )
        .catch(() =>
          showToast({
            title: "Could not remember workplace",
            type: "error",
          })
        );
  }

  return {
    practices,
    availablePractices,
    selectedPractice,
    practiceId: selectedPractice?.practice_id,
    selectPractice,
    setPractice,
  };
}
