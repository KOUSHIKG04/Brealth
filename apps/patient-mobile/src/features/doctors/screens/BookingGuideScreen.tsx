import { useBookingGuide } from "../hooks/useBookingGuide";
import { steps } from "../utils/bookingGuideConstants";
import { AppText as Text, Button, SafeAreaView } from "@startup/mobile-ui";

import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { StatusBar } from "expo-status-bar";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@startup/design-tokens";

export function BookingGuideScreen() {
  const { pageWidth, heroHeight, step, setStep, pages, scrollToStep, close } =
    useBookingGuide();
  const last = step === steps.length - 1;
  const artWidth = pageWidth - 40;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={[styles.body, { width: pageWidth }]}>
        <View style={styles.toolbar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={step ? "Previous step" : "Close booking guide"}
            hitSlop={8}
            onPress={() => (step ? scrollToStep(step - 1) : close())}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <ChevronLeft size={24} color={colors.patient.text} />
          </Pressable>
          {last ? (
            <View style={styles.iconButton} />
          ) : (
            <Button
              theme="patient"
              variant="ghost"
              label="Skip"
              onPress={close}
              style={styles.skip}
            />
          )}
        </View>

        <FlatList
          ref={pages}
          data={steps}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          style={styles.pages}
          keyExtractor={(item) => item.title}
          getItemLayout={(_, index) => ({
            length: pageWidth,
            offset: pageWidth * index,
            index,
          })}
          onMomentumScrollEnd={(event) =>
            setStep(
              Math.max(
                0,
                Math.min(
                  steps.length - 1,
                  Math.round(event.nativeEvent.contentOffset.x / pageWidth)
                )
              )
            )
          }
          renderItem={({ item, index }) => (
            <ScrollView
              style={{ width: pageWidth }}
              contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}
              accessibilityElementsHidden={step !== index}
              importantForAccessibility={
                step === index ? "auto" : "no-hide-descendants"
              }
            >
              <View style={[styles.stage, { height: heroHeight }]}>
                <Image
                  source={item.image}
                  resizeMode="contain"
                  accessible={false}
                  style={{
                    width: artWidth * item.imageScale,
                    height: heroHeight * item.imageScale,
                  }}
                />
              </View>

              <View style={styles.copy}>
                <View style={styles.stepPill}>
                  <Text variant="labelSmall" style={styles.stepPillText}>
                    Step {index + 1} of {steps.length}
                  </Text>
                </View>
                <Text
                  variant="screenTitle"
                  accessibilityRole="header"
                  style={styles.title}
                >
                  {item.title}
                </Text>
                <Text variant="body" style={styles.description}>
                  {item.description}
                </Text>
              </View>
            </ScrollView>
          )}
        />

        <View style={styles.footer}>
          <View style={styles.progress}>
            {steps.map((item, index) => (
              <Pressable
                key={item.title}
                accessibilityRole="button"
                accessibilityLabel={`Step ${index + 1}: ${item.title}`}
                accessibilityState={{ selected: step === index }}
                onPress={() => scrollToStep(index)}
                style={styles.segmentTarget}
              >
                <View
                  style={[styles.segment, index <= step && styles.segmentDone]}
                />
              </Pressable>
            ))}
          </View>
          <Button
            theme="patient"
            label={last ? "Start booking" : "Next"}
            onPress={() => (last ? close() : scrollToStep(step + 1))}
            style={styles.next}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  body: { flex: 1, alignSelf: "center" },
  pressed: { opacity: 0.6 },
  toolbar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  skip: { minWidth: 44, minHeight: 44, paddingHorizontal: 8 },
  progress: {
    alignSelf: "center",
    flexDirection: "row",
    gap: 4,
    marginBottom: 12,
  },
  segmentTarget: { width: 28, height: 20, justifyContent: "center" },
  segment: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.patient.surfaceBorder,
  },
  segmentDone: { backgroundColor: colors.patient.primaryDark },
  pages: { flex: 1 },
  page: {
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  stage: {
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { alignItems: "center", gap: 8, paddingHorizontal: 8 },
  stepPill: {
    height: 24,
    justifyContent: "center",
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.patient.surface,
  },
  stepPillText: {
    color: colors.patient.primaryDark,
    fontVariant: ["tabular-nums"],
  },
  title: { color: colors.patient.text, textAlign: "center" },
  description: {
    maxWidth: 360,
    color: colors.patient.textSecondary,
    textAlign: "center",
  },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  next: { minHeight: 52, borderRadius: 12 },
});
