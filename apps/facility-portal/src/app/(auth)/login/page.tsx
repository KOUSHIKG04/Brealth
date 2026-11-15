import { LoginScreen, safeReturnPath } from "@/features/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginScreen next={safeReturnPath(next)} />;
}
