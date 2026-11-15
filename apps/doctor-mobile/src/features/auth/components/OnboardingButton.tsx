import { styles } from "./OnboardingShell.styles";
import type { OnboardingButtonProps } from "../types/onboarding-button";

import { AppText as Text, Button } from "@startup/mobile-ui";

export function OnboardingButton({
  label,
  onPress,
  variant = "solid",
  disabled = false,
  loading = false,
}: OnboardingButtonProps) {
  return (
    <Button
      label={label}
      theme="doctor"
      variant={variant === "outline" ? "outline" : "primary"}
      loading={loading}
      disabled={disabled}
      onPress={onPress}
      labelStyle={[
        styles.buttonText,
        variant === "outline" && styles.outlineText,
      ]}
      rightIcon={
        <Text
          variant="cardHeading"
          style={[
            styles.buttonText,
            variant === "outline" && styles.outlineText,
          ]}
        >
          ›
        </Text>
      }
      style={({ pressed }) => [
        styles.button,
        variant === "outline" && styles.outline,
        (pressed || disabled) && styles.dim,
      ]}
    />
  );
}
