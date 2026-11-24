import { AppText as Text } from "../primitives/AppText";
import { Loader } from "../primitives/Loader";
import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import {
  Ambulance,
  Bell,
  CalendarCheck,
  FileText,
  Pill,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Wallet,
} from "lucide-react-native";
import { colors } from "@startup/design-tokens";
import type {
  NotificationItem,
  NotificationCardProps,
} from "../types/notification";
import {
  createNotificationStyles,
  notificationPalette,
} from "./NotificationDrawer.styles";

const kindIcons = {
  appointment: CalendarCheck,
  queue: Stethoscope,
  payment: Wallet,
  prescription: FileText,
  medicine: Pill,
  ambulance: Ambulance,
  account: ShieldCheck,
  general: Bell,
} satisfies Record<NotificationItem["type"], unknown>;

export function NotificationCard({
  item,
  theme,
  onPress,
  onDelete,
  deleting,
}: NotificationCardProps) {
  const styles = useMemo(() => createNotificationStyles(theme), [theme]);
  const palette = notificationPalette(theme);
  const KindIcon = kindIcons[item.type] ?? Bell;
  const translateX = useRef(new Animated.Value(0)).current;
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const settle = useCallback(
    (expanded: boolean) => {
      openRef.current = expanded;
      setOpen(expanded);
      Animated.spring(translateX, {
        toValue: expanded ? -76 : 0,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    },
    [translateX]
  );
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          !deleting &&
          Math.abs(g.dx) > 10 &&
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderGrant: () => translateX.stopAnimation(),
        onPanResponderMove: (_, g) =>
          translateX.setValue(
            Math.max(-76, Math.min(0, (openRef.current ? -76 : 0) + g.dx))
          ),
        onPanResponderRelease: (_, g) =>
          settle((openRef.current ? -76 : 0) + g.dx < -32),
        onPanResponderTerminate: () => settle(openRef.current),
      }),
    [deleting, settle, translateX]
  );
  const handlePress = useCallback(() => {
    if (openRef.current) {
      settle(false);
      return;
    }
    onPress(item.id);
  }, [item.id, onPress, settle]);

  return (
    <View style={styles.swipeRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete notification: ${item.title}`}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "yes" : "no-hide-descendants"}
        disabled={deleting}
        onPress={() => onDelete(item.id)}
        style={styles.deleteAction}
      >
        {deleting ? (
          <Loader theme={theme} color={colors.white} />
        ) : (
          <Trash2 size={22} color={colors.white} />
        )}
      </Pressable>
      <Animated.View
        {...pan.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.message}. ${item.read ? "Read" : "Unread"}`}
          accessibilityActions={[
            { name: "delete", label: "Delete notification" },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "delete" && !deleting)
              onDelete(item.id);
          }}
          style={({ pressed }) => [
            styles.notificationCard,
            pressed ? styles.cardPressed : undefined,
          ]}
          onPress={handlePress}
        >
          {!item.read ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[
                styles.unreadStripe,
                item.emergency ? styles.emergencyStripe : undefined,
              ]}
            />
          ) : null}
          <View
            style={[
              styles.iconContainer,
              item.emergency ? styles.emergencyIconContainer : undefined,
            ]}
          >
            <KindIcon
              size={20}
              strokeWidth={1.75}
              color={item.emergency ? colors.patient.sos.dark : palette.dark}
            />
          </View>

          <View style={styles.textContainer}>
            <View style={styles.cardHeaderRow}>
              <Text
                variant="cardHeading"
                numberOfLines={1}
                style={[
                  styles.itemTitle,
                  item.read ? styles.readItemTitle : undefined,
                  item.emergency ? styles.emergencyTitle : undefined,
                ]}
              >
                {item.title}
              </Text>
              <Text variant="caption" style={styles.itemTime}>
                {item.time}
              </Text>
            </View>
            {item.message ? (
              <Text
                variant="bodySmall"
                numberOfLines={3}
                style={styles.itemMessage}
              >
                {item.message}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
