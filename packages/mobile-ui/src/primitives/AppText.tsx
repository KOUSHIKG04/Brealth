import { Text, TextInput, type TextInputProps } from "react-native";
import type { Ref as ReactRef } from "react";
import { mobileTypography } from "@startup/design-tokens";
import { useReadableTypography } from "../theme/MobileTypographyProvider";
import type { AppTextProps } from "../types/appText";
import {
  appTextInputMaxFontScale,
  appTextMaxFontScale,
} from "../utils/appTextConstants";

export type { AppTextProps } from "../types/appText";

export function AppText({
  variant = "body",
  style,
  maxFontSizeMultiplier,
  ...props
}: AppTextProps) {
  const readable = useReadableTypography();
  const role = readable && variant !== "inherit" ? variant : undefined;
  return (
    <Text
      {...props}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ?? (role ? appTextMaxFontScale[role] : undefined)
      }
      style={[style, role ? mobileTypography[role] : undefined]}
    />
  );
}

/** Retains native input refs and keyboard behavior; only typography changes. */
export function AppTextInput({
  ref,
  style,
  maxFontSizeMultiplier,
  ...props
}: TextInputProps & { ref?: ReactRef<TextInput> }) {
  const readable = useReadableTypography();
  return (
    <TextInput
      {...props}
      ref={ref}
      maxFontSizeMultiplier={
        maxFontSizeMultiplier ??
        (readable ? appTextInputMaxFontScale : undefined)
      }
      style={[style, readable ? mobileTypography.body : undefined]}
    />
  );
}
