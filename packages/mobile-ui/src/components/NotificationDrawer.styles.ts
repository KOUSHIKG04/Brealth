import { StyleSheet } from "react-native";
import { colors, fontFamilies, radius } from "@startup/design-tokens";
import type { AppTheme } from "../utils/appTheme";

export function notificationPalette(app: AppTheme) {
  if (app === "patient")
    return { ...colors.patient, dark: colors.patient.primaryDark };
  if (app === "driver")
    return { ...colors.driver, accent: colors.driver.primary };
  return colors.doctor;
}

export function createNotificationStyles(app: AppTheme) {
  const palette = notificationPalette(app);
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      zIndex: 999,
    },
    backdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.ui.overlay,
    },
    drawer: {
      width: "100%",
      height: "100%",
      backgroundColor: colors.white,
    },
    drawerSubheader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
      backgroundColor: "#F8FCFB",
    },
    subheaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flexShrink: 0,
    },
    markReadButton: {
      minHeight: 32,
      justifyContent: "center",
    },
    // Same pill as the Filter on the patient doctor results screen.
    filterContainer: { flexShrink: 0 },
    filterTrigger: {
      minHeight: 32,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor:
        "surfaceBorder" in palette ? palette.surfaceBorder : colors.border,
      borderRadius: 16,
      backgroundColor: palette.surface,
    },
    filterText: {
      flexShrink: 0,
      color: palette.dark,
    },
    swipeRow: { borderRadius: radius.md, overflow: "hidden" },
    deleteAction: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: 76,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger,
    },
    unreadCountText: {
      flex: 1,
      color: colors.textSecondary,
      fontFamily: fontFamilies.medium,
      fontSize: 14,
    },
    markReadText: {
      color: palette.dark,
    },
    list: { flex: 1 },
    emptyList: { justifyContent: "center", alignItems: "center" },
    emptyMessage: { textAlign: "center" },
    listContent: {
      flexGrow: 1,
      padding: 16,
      gap: 8,
      paddingBottom: 40,
    },
    notificationCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingLeft: 16,
      paddingRight: 14,
      overflow: "hidden",
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    cardPressed: {
      backgroundColor: colors.disabledBackground,
    },
    unreadStripe: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: 3,
      backgroundColor: palette.primary,
    },
    emergencyStripe: {
      backgroundColor: colors.patient.sos.primary,
    },
    iconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      backgroundColor: palette.surface,
    },
    emergencyIconContainer: {
      backgroundColor: colors.patient.sos.surface,
    },
    textContainer: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    itemTitle: {
      flex: 1,
      color: palette.text,
    },
    readItemTitle: {
      color: colors.textSecondary,
    },
    emergencyTitle: {
      color: colors.patient.sos.dark,
    },
    itemTime: {
      flexShrink: 0,
      color: colors.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    itemMessage: {
      color: colors.textSecondary,
    },
    sectionLabel: {
      color: colors.textSecondary,
      paddingTop: 8,
      paddingBottom: 8,
      paddingHorizontal: 4,
    },
  });
}
