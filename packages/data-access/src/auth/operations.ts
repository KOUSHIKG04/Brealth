import {
  onboardingSchema,
  myProfileSchema,
  phoneSchema,
  otpSchema,
} from "@startup/contracts";
import type { OnboardingInput } from "@startup/contracts";
import type { AppSupabaseClient } from "../client/createSupabaseClient";
import { getAuthErrorMessage } from "./errorMessages";

async function authRequest<TResponse extends { data: unknown; error: unknown }>(
  request: PromiseLike<TResponse>,
  fallback: string
): Promise<TResponse["data"]> {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(getAuthErrorMessage(error, fallback));
  }
}

export async function sendPhoneOtp(client: AppSupabaseClient, phone: string) {
  const parsed = phoneSchema.parse(phone);
  await authRequest(
    client.auth.signInWithOtp({
      phone: parsed,
      options: { shouldCreateUser: true },
    }),
    "Could not send the code. Please try again."
  );
}

export async function verifyPhoneOtp(
  client: AppSupabaseClient,
  phone: string,
  token: string
) {
  const data = await authRequest(
    client.auth.verifyOtp({
      phone: phoneSchema.parse(phone),
      token: otpSchema.parse(token),
      type: "sms",
    }),
    "Could not verify the code. Please try again."
  );
  if (!data.session) throw new Error("Verification did not produce a session");
  return data.session;
}

export async function signInWithDevPassword(
  client: AppSupabaseClient,
  email: string,
  password: string
) {
  const data = await authRequest(
    client.auth.signInWithPassword({
      email: email.trim(),
      password,
    }),
    "Could not sign in. Check your details and try again."
  );
  if (!data.session) throw new Error("Sign-in did not produce a session");
  return data.session;
}

export async function signUpWithDevPassword(
  client: AppSupabaseClient,
  email: string,
  password: string
) {
  const data = await authRequest(
    client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    }),
    "Could not create your account. Please try again."
  );
  // With email confirmation enabled, Supabase creates the user without a
  // session. The user must confirm the email and then sign in.
  return data.session;
}

export async function getMyProfile(client: AppSupabaseClient) {
  const { data, error } = await client.rpc("get_my_profile");
  if (error) throw error;
  return data === null ? null : myProfileSchema.parse(data);
}

export async function completeOnboarding(
  client: AppSupabaseClient,
  input: OnboardingInput
) {
  const request = onboardingSchema.parse(input);
  const { data, error } = await client.rpc("complete_onboarding", {
    p_kind: request.kind,
    p_details: request.details,
  });
  if (error) throw error;
  return myProfileSchema.parse(data);
}

export async function createDriverInvitation(
  client: AppSupabaseClient,
  organizationId: string,
  phone: string
) {
  const { data, error } = await client.rpc("create_driver_invitation", {
    p_organization_id: organizationId,
    p_phone: phoneSchema.parse(phone),
  });
  if (error) throw error;
  return data;
}
