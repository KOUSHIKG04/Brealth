import { StyleSheet } from "react-native";
import { colors, fontFamilies, radius, surfaces } from "@startup/design-tokens";
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
    hintRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 4,
    },
    swipeHint: {
      flex: 1,
      textAlign: "right",
      fontFamily: fontFamilies.regular,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    filterContainer: { width: 160, flexShrink: 0 },
    filterTrigger: {
      width: "100%",
      minHeight: 40,
      height: 40,
      paddingHorizontal: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 10,
    },
    filterText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      includeFontPadding: false,
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
      color: palette.primary,
      fontFamily: fontFamilies.semibold,
      fontSize: 12,
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
      alignItems: "flex-start",
      gap: 12,
      padding: 16,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.white,
    },
    cardPressed: {
      backgroundColor: colors.disabledBackground,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
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
      gap: 4,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    itemKind: {
      flex: 1,
      color: palette.dark,
    },
    emergencyKind: {
      color: colors.patient.sos.dark,
    },
    itemTime: {
      color: colors.textSecondary,
      fontVariant: ["tabular-nums"],
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: palette.primary,
    },
    itemTitle: {
      color: palette.text,
    },
    readItemTitle: {
      color: colors.textSecondary,
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
