const serviceNames: Record<string, string> = {
  clinic: "in-person",
  online: "online",
  home: "home-visit",
};

/** In-app title and message for schedule and shift rotation decisions. */
export function scheduleNotificationCopy(
  templateKey: string,
  parameters: Record<string, unknown>
): { title: string; message: string } | null {
  const facility =
    typeof parameters.facility_name === "string"
      ? parameters.facility_name
      : "The facility";
  const reason =
    typeof parameters.reason === "string" && parameters.reason
      ? ` Reason: ${parameters.reason}`
      : "";
  const service = serviceNames[String(parameters.service_mode)] ?? "in-person";
  const starts =
    typeof parameters.effective_from === "string"
      ? ` It starts on ${parameters.effective_from.slice(0, 10)}.`
      : "";
  switch (templateKey) {
    case "shift.plan_approved":
      return {
        title: "Shift rotation approved",
        message: `${facility} approved your ${service} shift rotation.${starts}`,
      };
    case "shift.plan_rejected":
      return {
        title: "Shift rotation declined",
        message: `${facility} declined your ${service} shift rotation.${reason}`,
      };
    case "shift.plan_published":
      return {
        title: "Shift rotation updated",
        message: `${facility} published a ${service} shift rotation for you.${starts}`,
      };
    case "schedule.request_approved":
      return {
        title: "Schedule change approved",
        message: `${facility} approved your request. It is now live.`,
      };
    case "schedule.request_rejected":
      return {
        title: "Schedule change declined",
        message: `${facility} declined your request.${reason}`,
      };
    case "schedule.request_stale":
      return {
        title: "Schedule request needs resubmitting",
        message: `${facility} changed this schedule after your request. Review it and submit again.`,
      };
    default:
      return null;
  }
}
