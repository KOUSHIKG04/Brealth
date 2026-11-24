import { withSupabase } from "npm:@supabase/server@1.9.0";
import { providerClient, providerConfig } from "../_shared/razorpay.ts";
import {
  paymentFailure,
  providerCommand,
} from "../_shared/appointmentPayments.ts";
import {
  payoutCommand,
  processPayout,
  processAppointmentRefundsWithPayouts,
  routeTransfersEnabled,
} from "../_shared/marketplacePayouts.ts";
import {
  ambulanceCommand,
  reconcileAmbulance,
} from "../_shared/ambulancePayments.ts";
import { logFailure } from "../_shared/log.ts";

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, ctx) => {
    if (request.method !== "POST")
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    try {
      const config = providerConfig((name) => Deno.env.get(name));
      const api = providerClient(config);
      const appointments = await providerCommand<string[]>(
        ctx.supabaseAdmin,
        "work_queue",
        { mode: config.mode }
      );
      let completed = 0;
      for (const appointmentId of appointments) {
        try {
          await processAppointmentRefundsWithPayouts(
            ctx.supabaseAdmin,
            api,
            config,
            appointmentId
          );
          completed++;
        } catch (error) {
          /* Durable work stays reserved; uncertain POSTs are never replayed. */
          logFailure(
            "payment-reconcile",
            "appointment-refund",
            error,
            {
              appointment_id: appointmentId,
            },
            "warn"
          );
        }
      }
      const payouts = await payoutCommand<string[]>(
        ctx.supabaseAdmin,
        "queue",
        {},
        config
      );
      let payoutsChecked = 0;
      for (const entryId of payouts) {
        try {
          await processPayout(
            ctx.supabaseAdmin,
            api,
            config,
            entryId,
            routeTransfersEnabled((name) => Deno.env.get(name), config)
          );
          payoutsChecked++;
        } catch (error) {
          /* Keep uncertain transfers reserved for read reconciliation. */
          logFailure(
            "payment-reconcile",
            "payout",
            error,
            {
              payout_entry_id: entryId,
            },
            "warn"
          );
        }
      }
      const bookings = await ambulanceCommand<string[]>(
        ctx.supabaseAdmin,
        "queue",
        {},
        config
      );
      let ambulanceChecked = 0;
      for (const bookingId of bookings) {
        try {
          await reconcileAmbulance(ctx.supabaseAdmin, api, config, bookingId);
          ambulanceChecked++;
        } catch (error) {
          /* Orders remain reserved; never duplicate a timed-out POST. */
          logFailure(
            "payment-reconcile",
            "ambulance-order",
            error,
            {
              booking_id: bookingId,
            },
            "warn"
          );
        }
      }
      return Response.json({
        checked: appointments.length,
        completed,
        payoutsChecked,
        payoutCount: payouts.length,
        ambulanceChecked,
        ambulanceCount: bookings.length,
      });
    } catch (error) {
      return paymentFailure(error, "payment-reconcile", request);
    }
  }),
};
