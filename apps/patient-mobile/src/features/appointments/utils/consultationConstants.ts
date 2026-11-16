import type { ConsultationFlow } from "../types/consultation-flow";

export type { ConsultationFlow } from "../types/consultation-flow";

import type { ConsultationType } from "../types/appointment";

// Patient-facing names. ConsultationType values stay unchanged because routes,
// filters and saved navigation params use them.
export const consultationTypeLabels: Record<ConsultationType, string> = {
  "Clinic Visit": "In-person (OPD)",
  "Home Visit": "Home Visit",
  Online: "Online",
};

// In-person label for a specific workplace.
export const inPersonVisitLabels = {
  hospital: "Hospital Visit",
  clinic: "Clinic Visit",
} as const;

export const consultationFlows: Record<ConsultationType, ConsultationFlow> = {
  "Clinic Visit": {
    findDoctorTitle: "Find Your Doctor",
    resultsDescription:
      "Choose a nearby specialist based on experience and patient ratings.",
    requiresAddress: false,
    confirmationLabel: "Booking confirmed",
    showsPayment: true,
  },
  "Home Visit": {
    findDoctorTitle: "Find a Home Visit Doctor",
    resultsDescription:
      "Choose a doctor who can provide care at your selected address.",
    profileContext: "Home Visit",
    requiresAddress: true,
    confirmationLabel: "Home visit confirmed",
    showsPayment: true,
  },
  Online: {
    findDoctorTitle: "Find an Online Doctor",
    resultsDescription:
      "Choose an available specialist for a secure video consultation.",
    profileContext: "Online Consultation",
    requiresAddress: false,
    confirmationLabel: "Online consultation confirmed",
    showsPayment: false,
  },
};
