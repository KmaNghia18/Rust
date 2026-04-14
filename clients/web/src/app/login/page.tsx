"use client";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const schema = z.object({
  email:    z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  totp_code: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPass, setShowPass] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    try {
      const res = await authApi.login(data);
      const { user, access_token, refresh_token } = res.data;

      // Store tokens in localStorage + zustand
      localStorage.setItem("access_token", access_token);
      localStorage.setItem("refresh_token", refresh_token);
      setAuth(user, access_token, refresh_token);

      toast.success(`Welcome back, ${user.username}!`);
      router.replace("/");
    } catch (err: any) {
      const code = err.response?.data?.error?.code;
      if (code === "MFA_REQUIRED") {
        setNeeds2FA(true);
        toast("Enter your 2FA code", { icon: "🔐" });
      } else {
        toast.error(err.response?.data?.error?.message ?? "Login failed");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1c2e] p-4"
         style={{ backgroundImage: "radial-gradient(ellipse at 50% 0%, rgba(88,101,242,0.15) 0%, transparent 70%)" }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#5865f2] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#5865f2]/30">
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.04.028.055A19.9 19.9 0 0 0 5.993 21.02a.083.083 0 0 0 .091-.031c.489-.668.925-1.372 1.295-2.107a.075.075 0 0 0-.041-.104A13.15 13.15 0 0 1 5.47 17.9a.076.076 0 0 1 .008-.127c.126-.094.252-.192.372-.292a.072.072 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.073.073 0 0 1 .078.01c.12.099.246.198.373.292a.075.075 0 0 1 .006.127 12.298 12.298 0 0 1-1.873.888.076.076 0 0 0-.041.105c.36.735.796 1.44 1.285 2.106a.083.083 0 0 0 .091.031A19.857 19.857 0 0 0 23.9 18.112c.014-.015.026-.033.028-.055.413-4.975-.697-9.465-2.931-13.745a.06.06 0 0 0-.03-.027z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[#dcdbf0]">Welcome back!</h1>
          <p className="text-[#8b8fad] mt-1">We're so excited to see you again!</p>
        </div>

        {/* Card */}
        <div className="bg-[#252840] rounded-2xl p-8 shadow-2xl border border-[#2e3150]">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={inputCls(!!errors.email)}
              />
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={cn(inputCls(!!errors.password), "pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b8fad] hover:text-[#dcdbf0]"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {needs2FA && (
              <Field label="Two-Factor Code" error={errors.totp_code?.message}>
                <input
                  {...register("totp_code")}
                  placeholder="000000"
                  maxLength={6}
                  className={inputCls(!!errors.totp_code)}
                />
              </Field>
            )}

            <Link href="/forgot-password" className="block text-sm text-[#5865f2] hover:underline">
              Forgot your password?
            </Link>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-xl bg-[#5865f2] hover:bg-[#4752c4] text-white font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
              Log In
            </button>
          </form>

          <p className="text-sm text-[#8b8fad] mt-6 text-center">
            Need an account?{" "}
            <Link href="/register" className="text-[#5865f2] hover:underline font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-[#8b8fad] mb-1.5">
        {label} {error && <span className="text-[#ed4245] normal-case font-normal"> – {error}</span>}
      </label>
      {children}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    "w-full bg-[#1e2035] text-[#dcdbf0] placeholder-[#5c6080] rounded-lg px-3 py-2.5 text-sm outline-none",
    "border border-[#2e3150] focus:border-[#5865f2] transition-colors",
    hasError && "border-[#ed4245] focus:border-[#ed4245]"
  );
}
