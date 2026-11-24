import { useSelectPractice } from "../hooks/useSelectPractice";

import { Pressable, StyleSheet, View } from "react-native";

import { Building2, MapPin, Search } from "lucide-react-native";

import { fontFamilies } from "@startup/design-tokens";
import { AppText as Text, Input, Loader } from "@startup/mobile-ui";
import { DoctorScreen } from "../../../components/DoctorScreen";
import { palette, ui } from "../../../components/theme";

export function SelectPracticeScreen() {
  const {
    refresh,
    search,
    setSearch,
    saving,
    selected,
    approved,
    selectedId,
    loading,
    filtered,
    choose,
  } = useSelectPractice();
  return (
    <DoctorScreen
      onRefresh={saving ? undefined : refresh}
      title="Select Your Location"
      bottomNav={false}
      contentStyle={styles.content}
    >
      <View style={styles.search}>
        <Input
          variant="unstyled"
          accessibilityLabel="Search approved practice locations"
          placeholder="Search a hospital or clinic"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <Search size={20} color={palette.muted} />
      </View>
      <Text variant="label" style={styles.sectionTitle}>
        APPROVED PRACTICES
      </Text>
      {loading ? <Loader theme="doctor" /> : null}
      {!loading && filtered.length === 0 ? (
        <Text variant="bodySmall" style={styles.empty}>
          {approved.length
            ? "No matching practice locations."
            : "No approved practice location is available yet."}
        </Text>
      ) : null}
      <View style={styles.cards}>
        {filtered.map((practice) => {
          const active = practice.practice_id === selectedId;
          return (
            <Pressable
              key={practice.practice_id}
              accessibilityRole="button"
              accessibilityLabel={`Select ${practice.facility_name}${practice.address ? `, ${practice.address}` : ""}`}
              accessibilityState={{
                selected: active,
                disabled: Boolean(saving),
                busy: saving === practice.practice_id,
              }}
              disabled={Boolean(saving)}
              onPress={() => void choose(practice.practice_id)}
              style={({ pressed }) => [
                styles.practice,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.iconBox}>
                {saving === practice.practice_id ? (
                  <Loader theme="doctor" size="small" />
                ) : (
                  <Building2 size={25} color={palette.primary} />
                )}
              </View>
              <View style={ui.flex}>
                <View style={styles.titleRow}>
                  <Text
                    variant="cardHeading"
                    style={styles.name}
                    numberOfLines={1}
                  >
                    {practice.facility_name}
                  </Text>
                  {active ? (
                    <Text variant="labelSmall" style={styles.selected}>
                      Selected
                    </Text>
                  ) : null}
                </View>
                {practice.address ? (
                  <Text
                    variant="bodySmall"
                    style={styles.address}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {practice.address}
                  </Text>
                ) : null}
              </View>
              <MapPin size={18} color={palette.primary} />
            </Pressable>
          );
        })}
      </View>
    </DoctorScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingHorizontal: 20, paddingTop: 20 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: "#D9DDE0",
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    color: palette.text,
  },
  sectionTitle: { color: palette.muted, marginTop: 4 },
  cards: { gap: 12 },
  practice: {
    borderWidth: 1,
    borderColor: "#D9DDE0",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: palette.white,
  },
  iconBox: {
    width: 56,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.surface,
    borderRadius: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  name: { flexShrink: 1, color: palette.text },
  selected: {
    color: palette.dark,
    backgroundColor: palette.surface,
    borderRadius: 9,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  address: { color: palette.muted },
  empty: { color: palette.muted },
  pressed: { opacity: 0.76 },
});
