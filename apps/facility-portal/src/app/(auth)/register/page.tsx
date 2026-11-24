import { FacilitySignUpForm, safeReturnPath } from "@/features/auth";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="bg-muted flex min-h-svh items-center justify-center p-6">
      <FacilitySignUpForm next={safeReturnPath(next)} />
    </div>
  );
}
