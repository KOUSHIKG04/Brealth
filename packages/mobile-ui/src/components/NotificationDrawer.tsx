import { AppText as Text } from "../primitives/AppText";
import { Loader } from "../primitives/Loader";
import { ModalSurface } from "../primitives/ModalSurface";
import { Dropdown } from "../primitives/Dropdown";
import { Header } from "./Header";
import { NotificationCard } from "./NotificationCard";
import type {
  NotificationDrawerProps,
  NotificationItem,
} from "../types/notification";
import {
  createNotificationStyles,
  notificationPalette,
} from "./NotificationDrawer.styles";
import { useMobileThemeName } from "../theme/MobileThemeProvider";
import { PullToRefresh } from "../primitives/PullToRefresh";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Dimensions,
  Pressable,
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

function notificationSection(item?: NotificationItem) {
  if (!item?.createdAt) return undefined;
  return new Date(item.createdAt).toDateString() === new Date().toDateString()
    ? "Today"
    : "Earlier";
}

export type {
  NotificationItem,
  NotificationKind,
  NotificationDrawerProps,
} from "../types/notification";

/** Presentation only: apps own queries, mutations, notification copy and navigation. */
export function NotificationDrawer({
  visible,
  onClose,
  theme,
  notifications,
  loading = false,
  loadFailed = false,
  deletingId,
  onMarkAllRead,
  onNotificationPress,
  onDelete,
  onVisibilityChange,
  onRefresh,
}: NotificationDrawerProps) {
  const app = useMobileThemeName(theme);
  const styles = useMemo(() => createNotificationStyles(app), [app]);
  const palette = notificationPalette(app);
  const insets = useSafeAreaInsets();
  const [showModal, setShowModal] = useState(visible);
  const [filter, setFilter] = useState("all");
  const filteredNotifications = notifications.filter(
    (item) =>
      filter === "all" ||
      (filter === "unread" && !item.read) ||
      (filter === "read" && item.read) ||
      (filter === "important" && item.important) ||
      (filter === "emergency" && item.emergency)
  );
  const renderNotification = useCallback(
    ({ item, index }: { item: NotificationItem; index: number }) => {
      const section = notificationSection(item);
      const showSection =
        section !== undefined &&
        section !== notificationSection(filteredNotifications[index - 1]);
      return (
        <>
          {showSection ? (
            <Text
              variant="labelSmall"
              accessibilityRole="header"
              style={styles.sectionLabel}
            >
              {section}
            </Text>
          ) : null}
          <NotificationCard
            theme={app}
            item={item}
            onPress={onNotificationPress}
            onDelete={onDelete}
            deleting={deletingId === item.id}
          />
        </>
      );
    },
    [
      app,
      filteredNotifications,
      onNotificationPress,
      onDelete,
      deletingId,
      styles.sectionLabel,
    ]
  );
  const slideAnimRef = useRef<Animated.Value | null>(null);
  if (slideAnimRef.current === null) {
    slideAnimRef.current = new Animated.Value(SCREEN_WIDTH);
  }
  const slideAnim = slideAnimRef.current;

  const fadeAnimRef = useRef<Animated.Value | null>(null);
  if (fadeAnimRef.current === null) {
    fadeAnimRef.current = new Animated.Value(0);
  }
  const fadeAnim = fadeAnimRef.current;

  useEffect(() => {
    // No native animation views exist while the drawer is initially closed.
    if (!visible && !showModal) return;
    // Mount the native drawer before starting its entrance animation.
    if (visible && !showModal) {
      setShowModal(true);
      return;
    }
    let active = true;
    let animation: Animated.CompositeAnimation;
    if (visible) {
      slideAnim.setValue(SCREEN_WIDTH);
      animation = Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]);
    } else {
      animation = Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: SCREEN_WIDTH,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
      ]);
    }
    animation.start(({ finished }) => {
      if (active && finished && !visible) {
        setShowModal(false);
        onVisibilityChange?.(false);
      }
    });
    return () => {
      active = false;
      animation.stop();
    };
  }, [visible, showModal, slideAnim, fadeAnim, onVisibilityChange]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onCloseRef.current();
        return true;
      }
    );
    return () => backHandler.remove();
  }, [visible]);

  if (!showModal) return null;

  return (
    <ModalSurface
      layout="custom"
      transparent
      visible={showModal}
      onShow={() => onVisibilityChange?.(true)}
      animationType="none"
      onClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable
            accessibilityLabel="Close notification drawer"
            accessibilityRole="button"
            style={StyleSheet.absoluteFill}
            onPress={onClose}
          />
        </Animated.View>

        <Animated.View
          style={[styles.drawer, { transform: [{ translateX: slideAnim }] }]}
        >
          <Header title="Notification" app={app} onBackPress={onClose} />

          <View style={styles.drawerSubheader}>
            <Text
              variant="label"
              style={styles.unreadCountText}
              numberOfLines={1}
            >
              {notifications.filter((n) => !n.read).length > 0
                ? `${notifications.filter((n) => !n.read).length} new notification${
                    notifications.filter((n) => !n.read).length > 1 ? "s" : ""
                  }`
                : "All caught up"}
            </Text>
            <View style={styles.subheaderActions}>
              {notifications.some((n) => !n.read) ? (
                <Pressable
                  accessibilityLabel="Mark all as read"
                  accessibilityRole="button"
                  onPress={onMarkAllRead}
                  hitSlop={8}
                  style={styles.markReadButton}
                >
                  <Text variant="label" style={styles.markReadText}>
                    Mark all read
                  </Text>
                </Pressable>
              ) : null}
              <Dropdown
                theme={app}
                accessibilityLabel="Filter notifications"
                value={filter}
                onValueChange={setFilter}
                options={[
                  { label: "All", value: "all" },
                  { label: "Unread", value: "unread" },
                  { label: "Read", value: "read" },
                  { label: "Important", value: "important" },
                  { label: "Emergency", value: "emergency" },
                ]}
                compact
                chevronSize={12}
                chevronColor={palette.dark}
                containerStyle={styles.filterContainer}
                triggerStyle={styles.filterTrigger}
                valueStyle={styles.filterText}
                menuWidth={176}
              />
            </View>
          </View>

          <FlatList
            data={filteredNotifications}
            keyExtractor={(item) => item.id}
            renderItem={renderNotification}
            alwaysBounceVertical={onRefresh ? true : undefined}
            refreshControl={
              onRefresh ? (
                <PullToRefresh theme={app} onRefresh={onRefresh} />
              ) : undefined
            }
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              !loading &&
                !loadFailed &&
                filteredNotifications.length === 0 &&
                styles.emptyList,
              { paddingBottom: Math.max(insets.bottom, 20) + 20 },
            ]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={loading ? <Loader theme={app} /> : null}
            ListEmptyComponent={
              !loading && !loadFailed ? (
                <Text
                  variant="body"
                  style={[styles.itemMessage, styles.emptyMessage]}
                >
                  {filter === "all"
                    ? "No notifications yet."
                    : "No notifications match this filter."}
                </Text>
              ) : null
            }
          />
        </Animated.View>
      </View>
    </ModalSurface>
  );
}
