import { userErrorMessage } from "@startup/contracts";
import { useToastFeedback } from "@startup/mobile-ui";
import { useState } from "react";
import { router } from "expo-router";
import {
  signInWithDevPassword,
  signUpWithDevPassword,
  getAuthErrorMessage,
} from "@startup/data-access";
import { supabase } from "../../../services/supabase";
import { googleLoginEnabled } from "../utils/loginConstants";

export function useLogin() {
  const [mode, setMode] = useState<"dev" | "prod">("dev");
  const [emailMode, setEmailMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useToastFeedback({ error });

  async function signIn() {
    if (!supabase) {
      setError("Supabase is not configured on this device.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signInWithDevPassword(supabase, email, password);
      router.replace("/setup");
    } catch (cause) {
      setError(userErrorMessage(cause, "Could not sign in."));
    } finally {
      setBusy(false);
    }
  }

  async function signUp() {
    if (!supabase) {
      setError("Supabase is not configured on this device.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 12) {
      setError("Use a password with at least 12 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = await signUpWithDevPassword(supabase, email, password);
      if (session) router.replace("/setup");
      else setConfirmationPending(true);
    } catch (cause) {
      setError(userErrorMessage(cause, "Could not create your account."));
    } finally {
      setBusy(false);
    }
  }

  function switchEmailMode() {
    setEmailMode(emailMode === "signin" ? "signup" : "signin");
    setError("");
    setConfirmPassword("");
    setConfirmationPending(false);
  }

  async function continueWithGoogle() {
    if (!googleLoginEnabled) return;
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }
    setError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
      });
      if (error) throw error;
    } catch (cause) {
      setError(getAuthErrorMessage(cause, "Could not sign in with Google."));
    }
  }

  return {
    mode,
    setMode,
    emailMode,
    setEmailMode,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    confirmationPending,
    setConfirmationPending,
    busy,
    setError,
    signIn,
    signUp,
    switchEmailMode,
    continueWithGoogle,
  };
}
