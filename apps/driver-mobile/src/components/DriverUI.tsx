import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { colors, fontFamilies } from "@startup/design-tokens";
import { palette, ui } from "./theme";
import {
  AppText as Text,
  PullToRefresh,
  type AppTextProps,
  type PullToRefreshProps,
} from "@startup/mobile-ui";

export function Copy({ style, ...props }: AppTextProps) {
  return <Text variant="bodySmall" {...props} style={[ui.copy, style]} />;
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Copy variant="cardHeading" accessibilityRole="header" style={ui.heading}>
      {children}
    </Copy>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={ui.card}>{children}</View>;
}

export function PageHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView edges={["top"]} style={ui.header}>
      <View style={ui.headerRow}>
        {onBack && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={onBack}
            style={ui.iconButton}
          >
            <ChevronLeft color="white" />
          </Pressable>
        )}
        <View style={ui.grow}>
          <Copy variant="screenTitle" style={ui.title}>
            {title}
          </Copy>
        </View>
        {right}
      </View>
    </SafeAreaView>
  );
}

export function Body({
  children,
  onRefresh,
}: {
  children: ReactNode;
  onRefresh?: PullToRefreshProps["onRefresh"];
}) {
  return (
    <ScrollView
      alwaysBounceVertical={onRefresh ? true : undefined}
      refreshControl={
        onRefresh ? (
          <PullToRefresh theme="driver" onRefresh={onRefresh} />
        ) : undefined
      }
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={ui.body}
    >
      {children}
    </ScrollView>
  );
}

export function Metrics({ items }: { items: [string, string][] }) {
  return (
    <Card>
      <View style={ui.row}>
        {items.map(([value, label], i) => (
          <View key={label} style={[ui.metric, i > 0 && ui.metricBorder]}>
            <Copy variant="sectionHeading" style={ui.metricValue}>
              {value}
            </Copy>
            <Copy variant="caption" style={ui.caption}>
              {label}
            </Copy>
          </View>
        ))}
      </View>
    </Card>
  );
}
