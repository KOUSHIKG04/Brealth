import { StyleSheet } from "react-native";
import { colors, fontFamilies, spacing } from "@startup/design-tokens";

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.patient.background },
  headerTitle: {
    color: colors.white,
  },
  onlineHeaderTitle: {
    color: colors.white,
  },
  content: {
    gap: 14,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 126,
  },
  tabSection: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 14,
    overflow: "hidden",
  },
  page: {},
  tabLoader: { minHeight: 240 },
  message: {
    color: colors.patient.textSecondary,
  },
  locations: { gap: 10 },
  confirmationActions: { gap: 10 },
  confirmationButton: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  confirmationButtonLabel: {
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.patient.surfaceBorder,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  selectedLocation: {
    borderColor: colors.patient.primaryDark,
    backgroundColor: colors.patient.primaryDark,
  },
  locationCopy: { flex: 1, minWidth: 0, gap: 2 },
  locationName: { color: colors.patient.text },
  selectedLocationText: { color: colors.white },
  selectedLocationMeta: { color: "rgba(255,255,255,0.85)" },
  radio: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: 9,
  },
  radioSelected: { borderColor: colors.white },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  profileSkeleton: {
    minHeight: 120,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#E6F4F3",
  },
});
