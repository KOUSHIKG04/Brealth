import { useEffect, useRef, useState } from "react";
import { useNavigation } from "expo-router";

/**
 * Asks before leaving with unpublished edits: the header back button,
 * Android back and the back gesture all remove the screen.
 */
export function useDiscardChangesPrompt(hasChanges: boolean) {
  const navigation = useNavigation();
  const [pending, setPending] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  const leaving = useRef(false);
  useEffect(() => {
    if (!hasChanges) return;
    return navigation.addListener("beforeRemove", (event) => {
      if (leaving.current) return;
      event.preventDefault();
      setPending(() => event.data.action);
    });
  }, [navigation, hasChanges]);
  return {
    visible: pending !== null,
    keepEditing: () => setPending(null),
    discard: () => {
      if (!pending) return;
      leaving.current = true;
      setPending(null);
      navigation.dispatch(pending);
    },
  };
}
