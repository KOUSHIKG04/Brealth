export const steps = [
  {
    image: require("../../../../assets/images/booking-guide/find-care.png"),
    imageScale: 1,
    title: "Find the care you need",
    description:
      "Search by symptom or specialty. Choose clinic, online or home care from the Home screen.",
  },
  {
    image: require("../../../../assets/images/booking-guide/choose-doctor.png"),
    imageScale: 1.04,
    title: "Choose your doctor",
    description:
      "Explore verified doctors and compare their qualifications, specialties and consultation fees.",
  },
  {
    image: require("../../../../assets/images/booking-guide/choose-slot.png"),
    imageScale: 0.92,
    title: "Pick a date and time",
    description:
      "Choose yourself or a family member, select an available slot, and enter your reason for the visit.",
  },
  {
    image: require("../../../../assets/images/booking-guide/booking-status.png"),
    imageScale: 0.92,
    title: "Check your booking status",
    description:
      "Pay now to confirm, or pay once the doctor accepts your request. Track every booking in My Bookings.",
  },
] as const;
