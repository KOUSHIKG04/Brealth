import type { AppTheme } from "../utils/appTheme";

export type NotificationKind =
  | "appointment"
  | "queue"
  | "payment"
  | "prescription"
  | "medicine"
  | "ambulance"
  | "account"
  | "general";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  time: string;
  type: NotificationKind;
  read: boolean;
  important: boolean;
  emergency: boolean;
  /** ISO time; when set, the drawer groups items under Today and Earlier. */
  createdAt?: string;
};

export type NotificationDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<unknown>;
  theme?: AppTheme;
  notifications: readonly NotificationItem[];
  loading?: boolean;
  loadFailed?: boolean;
  deletingId?: string;
  onMarkAllRead: () => void;
  onNotificationPress: (id: string) => void;
  onDelete: (id: string) => void;
  /** Includes the closing animation so app queries can remain active until hidden. */
  onVisibilityChange?: (visible: boolean) => void;
};

export type NotificationCardProps = {
  item: NotificationItem;
  theme: AppTheme;
  onPress: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
};
