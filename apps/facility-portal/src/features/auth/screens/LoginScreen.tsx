import { LoginForm } from "../components/LoginForm";

export default function LoginScreen({ next }: { next?: string }) {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-md">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
