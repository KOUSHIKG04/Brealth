import type { DoctorProfileScreenProps } from "../types/doctor-profile-screen";
import { AppText as Text } from "@startup/mobile-ui";
import { Pressable, View } from "react-native";
import { router, type Href } from "expo-router";
import * as Crypto from "expo-crypto";
import { FadedScrollView, Header, Loader, Skeleton } from "@startup/mobile-ui";
import DoctorCard from "../components/DoctorCard";
import {
  AboutDoctor,
  BookSlots,
  HomeVisitAddress,
  OnlineConsultation,
  ProfileTabs,
} from "../components/index";
import {
  consultationFlows,
  inPersonVisitLabels,
} from "../../appointments/utils/consultationConstants";
import { formatConsultationFee } from "../utils/doctorDisplay";
import { useDoctorBooking } from "../hooks/useDoctorBooking";
import { styles } from "../components/DoctorProfile.styles";
import { BookingConfirmationDialog } from "../components/BookingConfirmationDialog";
import { BookingProgress } from "../components/BookingProgress";
import { PaymentFailedDialog } from "../components/PaymentFailedDialog";

export function DoctorProfileScreen({
  practiceId: initialPracticeId,
  serviceId,
  consultationType,
}: DoctorProfileScreenProps) {
  const {
    bookingStage,
    paymentFailure,
    recoveringPayment,
    retryPayment,
    cancelFailedBooking,
    dismissPaymentFailure,
    bookingOptions,
    acceptedPolicy,
    setAcceptedPolicy,
    refresh,
    setSelectedPracticeId,
    profile,
    activeTab,
    requestedTab,
    switchingTab,
    setActiveTab,
    setOverrideConsultationType,
    selectedConsultationType,
    isOnline,
    serviceMode,
    homeAddress,
    homeLocationReady,
    setIdempotencyKey,
    confirmation,
    setConfirmation,
    openingConfirmation,
    setOpeningConfirmation,
    selectedLocation,
    practiceQuery,
    locations,
    practiceId,
    slotsQuery,
    familyQuery,
    slots,
    unavailableTimes,
    practice,
    bioQuery,
    book,
  } = useDoctorBooking({
    practiceId: initialPracticeId,
    serviceId,
    consultationType,
  });
  return (
    <View style={styles.screen}>
      <Header
        title={
          selectedConsultationType === "Online"
            ? "Doctor Details (Online Consultation)"
            : selectedConsultationType === "Home Visit"
              ? "Doctor Details (Home Consultation)"
              : "Doctor Details"
        }
        app="patient"
        onBackPress={() => router.back()}
        titleStyle={
          selectedConsultationType === "Clinic Visit"
            ? styles.headerTitle
            : styles.onlineHeaderTitle
        }
      />
      <FadedScrollView
        onRefresh={book.isPending || confirmation ? undefined : refresh}
        refreshTheme="patient"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {practiceQuery.isLoading ? (
          <View style={styles.profileSkeleton}>
            <Skeleton theme="patient" width={56} height={56} radius={28} />
            <View style={{ flex: 1, gap: 10 }}>
              <Skeleton theme="patient" width="70%" height={18} />
              <Skeleton theme="patient" width="48%" height={14} />
            </View>
          </View>
        ) : null}
        {!practice && !practiceQuery.isLoading && !practiceQuery.isError ? (
          <Text variant="body" style={styles.message}>
            This practice is not available.
          </Text>
        ) : null}
        {practice ? (
          <>
            <DoctorCard
              variant="detail"
              name={practice.doctor_name}
              qualification={practice.qualification ?? ""}
              specialty={
                practice.specialties.map((item) => item.name).join(", ") ||
                practice.service_name
              }
              rating={
                practice.rating === null
                  ? "No ratings yet"
                  : `${practice.rating} (${practice.review_count} reviews)`
              }
              showRating
              experience={`${practice.experience_years} Years Experience`}
              hideExperience
              hideFee
              distanceMeters={isOnline ? null : practice.distance_meters}
              contextLabel={
                selectedConsultationType === "Online"
                  ? undefined
                  : selectedConsultationType === "Clinic Visit"
                    ? inPersonVisitLabels[practice.facility_kind]
                    : consultationFlows[selectedConsultationType].profileContext
              }
            />
            {locations.length > 1 ? (
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel={
                  isOnline ? "Consultation provider" : "Consultation location"
                }
                style={styles.locations}
              >
                <Text variant="sectionHeading">
                  {isOnline ? "Consultation provider" : "Choose a location"}
                </Text>
                {locations.map((location) => (
                  <Pressable
                    key={location.practice_id}
                    accessibilityRole="radio"
                    accessibilityState={{
                      checked: location.practice_id === practiceId,
                      disabled: book.isPending,
                    }}
                    disabled={book.isPending}
                    onPress={() => {
                      setSelectedPracticeId(location.practice_id);
                      setIdempotencyKey(Crypto.randomUUID());
                    }}
                    style={[
                      styles.location,
                      location.practice_id === practiceId &&
                        styles.selectedLocation,
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        location.practice_id === practiceId &&
                          styles.radioSelected,
                      ]}
                    >
                      {location.practice_id === practiceId ? (
                        <View style={styles.radioDot} />
                      ) : null}
                    </View>
                    <View style={styles.locationCopy}>
                      <Text
                        variant="label"
                        numberOfLines={1}
                        style={[
                          styles.locationName,
                          location.practice_id === practiceId &&
                            styles.selectedLocationText,
                        ]}
                      >
                        {location.facility_name}
                      </Text>
                      {!isOnline ? (
                        <Text
                          variant="caption"
                          numberOfLines={1}
                          style={[
                            styles.message,
                            location.practice_id === practiceId &&
                              styles.selectedLocationMeta,
                          ]}
                        >
                          {location.address}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {selectedConsultationType === "Clinic Visit" &&
            practice.online_enabled ? (
              <OnlineConsultation
                fee={
                  practice.online_fee_minor === null
                    ? "Fee not published"
                    : formatConsultationFee(
                        practice.online_fee_minor,
                        practice.currency
                      )
                }
                onBookPress={() => {
                  setOverrideConsultationType("Online");
                  setActiveTab("slots");
                }}
              />
            ) : null}
            {consultationFlows[selectedConsultationType].requiresAddress ? (
              <HomeVisitAddress
                onConfirm={() => router.push("/(app)/select-location" as Href)}
                verifiedAddress={selectedLocation ? homeAddress : ""}
              />
            ) : null}
            <View style={styles.tabSection}>
              <ProfileTabs
                activeTab={requestedTab}
                onTabChange={setActiveTab}
              />
              <View style={styles.page}>
                {switchingTab ? (
                  <Loader theme="patient" style={styles.tabLoader} />
                ) : activeTab === "about" ? (
                  <AboutDoctor
                    doctorName={practice.doctor_name}
                    bio={bioQuery.data ?? practice.bio ?? null}
                    facilityName={practice.facility_name}
                    facilityAddress={practice.address}
                    distanceMeters={isOnline ? null : practice.distance_meters}
                    languages={practice.languages}
                    onBack={() => router.back()}
                    onGoToSlots={() => setActiveTab("slots")}
                  />
                ) : (
                  <>
                    {selectedConsultationType === "Home Visit" ? (
                      <Text variant="body" style={styles.message}>
                        {homeLocationReady
                          ? "Your saved address will be checked against the doctor’s travel radius before booking."
                          : "Choose a saved address with a map pin, building and city to book a home visit."}
                      </Text>
                    ) : null}
                    <BookSlots
                      homeLocationReady={homeLocationReady}
                      key={`${practiceId}:${serviceMode}`}
                      timeZone={practice.timezone}
                      address={
                        consultationFlows[selectedConsultationType]
                          .requiresAddress
                          ? homeAddress
                          : undefined
                      }
                      consultationType={selectedConsultationType}
                      slots={slots}
                      unavailableTimes={unavailableTimes}
                      patientOptions={[
                        ...(profile?.patient_id
                          ? [
                              {
                                id: profile.patient_id,
                                label: "Self",
                                verified: true,
                              },
                            ]
                          : []),
                        ...(familyQuery.data ?? []).map((member) => ({
                          id: member.id,
                          label: member.full_name,
                          verified: member.verified,
                        })),
                      ]}
                      loading={slotsQuery.isLoading}
                      error={
                        slotsQuery.isError
                          ? "Could not load available slots."
                          : null
                      }
                      busy={
                        Boolean(confirmation) ||
                        openingConfirmation ||
                        book.isPending
                      }
                      openingConfirmation={openingConfirmation}
                      onGoToAbout={() => setActiveTab("about")}
                      onBookAppointment={(selection) => {
                        const slot = slots.find(
                          (item) => item.window_id === selection.time
                        );
                        if (!slot || book.isPending) return;
                        setOpeningConfirmation(true);
                        setConfirmation({
                          patientId: selection.patientId,
                          windowId: selection.time,
                          reason: selection.reason,
                          practiceId,
                          mode: serviceMode,
                          doctor: practice.doctor_name,
                          facility: practice.facility_name,
                          address:
                            serviceMode === "home"
                              ? homeAddress
                              : practice.address,
                          ...(serviceMode === "home"
                            ? { locationId: selectedLocation?.id }
                            : {}),
                          startsAt: slot.starts_at,
                          timezone: slot.timezone,
                          fee: formatConsultationFee(
                            slot.fee_minor,
                            slot.currency
                          ),
                        });
                      }}
                    />
                  </>
                )}
              </View>
            </View>
          </>
        ) : null}
      </FadedScrollView>
      <BookingConfirmationDialog
        bookingOptions={bookingOptions}
        acceptedPolicy={acceptedPolicy}
        setAcceptedPolicy={setAcceptedPolicy}
        confirmation={confirmation}
        setOpeningConfirmation={setOpeningConfirmation}
        setConfirmation={setConfirmation}
        book={book}
        practiceId={practiceId}
        serviceMode={serviceMode}
        slots={slots}
      />
      <BookingProgress stage={bookingStage} />
      <PaymentFailedDialog
        failure={paymentFailure}
        recovering={recoveringPayment}
        timeZone={practice?.timezone}
        onRetry={() => void retryPayment()}
        onCancel={() => void cancelFailedBooking()}
        onClose={dismissPaymentFailure}
      />
    </View>
  );
}
