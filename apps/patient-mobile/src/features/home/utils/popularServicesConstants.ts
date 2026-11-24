import type { PopularService } from "../types/home";
import { Accessibility, Heart, Microscope, Pill } from "lucide-react-native";

export const defaultServices: readonly PopularService[] = [
  {
    key: "lab",
    label: "Book Lab Tests",
    icon: Microscope,
    iconColor: "#F04F5F",
    backgroundColor: "#FFE3E5",
  },
  {
    key: "medicines",
    label: "Medicines",
    icon: Pill,
    iconColor: "#F044A1",
    backgroundColor: "#FBE1F1",
  },
  {
    key: "equipment",
    label: "Rental equipment",
    icon: Accessibility,
    iconColor: "#F59E0B",
    backgroundColor: "#FFF0BC",
  },
  {
    key: "insurance",
    label: "Insurance",
    icon: Heart,
    iconColor: "#7C3AED",
    backgroundColor: "#ECE5FF",
  },
] as const;
