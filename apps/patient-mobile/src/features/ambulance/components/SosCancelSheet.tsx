import type { SosCancelSheetProps } from "../types/sos";
import { s } from "./SosEmergency.styles";

import { AppText as Text, Button, ModalSurface } from "@startup/mobile-ui";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleCheck } from "lucide-react-native";
import { colors } from "@startup/design-tokens";

export function SosCancelSheet({
  visible,
  cancelling,
  onConfirm,
  onDismiss,
}: SosCancelSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <ModalSurface
      visible={visible}
      layout="custom"
      transparent
      animationType="slide"
      onClose={onDismiss}
    >
      <View style={s.sheetBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep emergency active"
          onPress={onDismiss}
          style={s.sheetDismissArea}
        />
        <View
          accessibilityViewIsModal
          style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
        >
          <View style={s.sheetHandle} />
          <View style={s.sheetIcon}>
            <CircleCheck
              color={colors.patient.sos.dark}
              size={28}
              strokeWidth={1.75}
            />
          </View>
          <Text
            variant="screenTitle"
            accessibilityRole="header"
            style={s.sheetTitle}
          >
            Cancel emergency?
          </Text>
          <Text variant="bodySmall" style={s.sheetCopy}>
            Confirm you’re out of danger. This stops the search for an
            ambulance.
          </Text>
          <Button
            label="Yes, I’m safe — Cancel"
            variant="danger"
            loading={cancelling}
            disabled={cancelling}
            onPress={onConfirm}
            style={s.sheetConfirm}
          />
          <Button
            label="No, keep emergency active"
            variant="outline"
            disabled={cancelling}
            onPress={onDismiss}
          />
        </View>
      </View>
    </ModalSurface>
  );
}
