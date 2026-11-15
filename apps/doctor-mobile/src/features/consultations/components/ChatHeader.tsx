import { styles } from "./ConsultationChat.styles";
import type { ChatHeaderProps } from "../types/chat-header";
import { memo } from "react";
import { Label } from "../../../components/DoctorScreen";

export const ChatHeader = memo(function ChatHeader({ mode }: ChatHeaderProps) {
  return (
    <Label variant="caption" muted style={styles.headerLabel}>
      TODAY Â· {mode === "home" ? "HOME VISIT" : "ONLINE CONSULTATION"}
    </Label>
  );
});
