import type { Props } from "../types/booking-time-section";

export type { Props } from "../types/booking-time-section";

import { AppText as Text } from "@startup/mobile-ui";
import { View } from "react-native";
import { TimeSlot } from "@startup/mobile-ui";

import { styles } from "./BookSlots.styles";
import { slotStatusLabels } from "../utils/doctorProfileConstants";

export function BookingTimeSection({
  selectedTime,
  setSelectedTime,
  selectedDate,
  dateSlots,
  dateUnavailable = [],
  loading,
  error,
  timeZone,
}: Props) {
  const dailyAllowances = dateSlots.flatMap((slot) =>
    slot.daily_bookings_remaining == null ? [] : [slot.daily_bookings_remaining]
  );
  // The day's app limit is reached: only taken times are shown, labelled.
  const appClosed = dateUnavailable.some((slot) => slot.status === "closed");
  const booked = dateUnavailable.filter((slot) => slot.status === "booked");
  // Bookable and taken times, in time order.
  const times = [
    ...dateSlots.map((slot) => ({
      window_id: slot.window_id,
      starts_at: slot.starts_at,
      caption: undefined as string | undefined,
    })),
    ...booked.map((slot) => ({
      window_id: slot.window_id,
      starts_at: slot.starts_at,
      caption: slotStatusLabels.booked as string,
    })),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const bookingsRemaining = dailyAllowances.length
    ? Math.min(dateSlots.length, ...dailyAllowances)
    : null;
  return (
    <View style={styles.bookingSection}>
      <View style={styles.sectionHeadingRow}>
        <Text variant="sectionHeading" style={styles.sectionTitle}>
          Select time
        </Text>
        {bookingsRemaining !== null && !loading && !error ? (
          <Text variant="bodySmall" style={styles.availability}>
            {bookingsRemaining === 1
              ? "1 booking left"
              : `${bookingsRemaining} bookings left`}
          </Text>
        ) : null}
      </View>
      {dateSlots.length > 0 && !loading && !error ? (
        <Text variant="bodySmall" style={styles.availability}>
          Choose any available time below.
        </Text>
      ) : null}
      {selectedDate && !loading && !error && dateSlots.length === 0 ? (
        <Text variant="bodySmall" style={styles.availability}>
          {appClosed
            ? "App booking closed for this date. Choose another date."
            : booked.length
              ? "All times on this date are booked. Choose another date."
              : "Not available on this date. Choose another date."}
        </Text>
      ) : null}
      {!selectedDate && !loading && !error ? (
        <Text variant="bodySmall" style={styles.availability}>
          No appointment times in this month. Choose another month or check back
          later.
        </Text>
      ) : null}
      <View style={styles.slotGrid}>
        {times.map((slot) => {
          const time = new Date(slot.starts_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone,
          });
          const unavailable = Boolean(slot.caption);
          const selected = !unavailable && selectedTime === slot.window_id;
          return (
            <TimeSlot
              key={slot.window_id}
              time={time}
              caption={slot.caption}
              disabled={unavailable}
              accessibilityRole="radio"
              accessibilityState={{
                selected,
                disabled: unavailable,
              }}
              onPress={
                unavailable ? undefined : () => setSelectedTime(slot.window_id)
              }
              style={[
                styles.timeSlot,
                selected ? styles.selectedTimeSlot : undefined,
              ]}
              textStyle={[selected ? styles.selectedTimeText : undefined]}
            />
          );
        })}
      </View>
    </View>
  );
}
