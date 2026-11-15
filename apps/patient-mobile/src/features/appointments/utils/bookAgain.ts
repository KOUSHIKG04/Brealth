import type { Href } from "expo-router";
import type { ClinicAppointment } from "@startup/contracts";

/** Same doctor and service when known, otherwise doctor search. */
export function bookAgainRoute(item: ClinicAppointment): Href {
  if (!item.practice_id) return "/find-doctor" as Href;
  return {
    pathname: "/doctor-profile",
    params: {
      practiceId: item.practice_id,
      serviceId: item.practice_service_id ?? "",
      consultationType:
        item.visit_mode === "online"
          ? "Online"
          : item.visit_mode === "home"
            ? "Home Visit"
            : "Clinic Visit",
    },
  } as Href;
}
