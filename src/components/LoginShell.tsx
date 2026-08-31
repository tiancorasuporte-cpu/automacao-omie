import type { ReactNode } from "react";

import { BrandLogo } from "@/components/BrandLogo";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const PARTICLES = [
  { left: "8%", top: "18%", size: 6, delay: "0s", duration: "9s" },
  { left: "18%", top: "72%", size: 4, delay: "1.2s", duration: "11s" },
  { left: "28%", top: "30%", size: 5, delay: "0.4s", duration: "10s" },
  { left: "42%", top: "82%", size: 3, delay: "2s", duration: "8s" },
  { left: "58%", top: "14%", size: 5, delay: "0.8s", duration: "12s" },
  { left: "68%", top: "58%", size: 4, delay: "1.6s", duration: "9.5s" },
  { left: "78%", top: "26%", size: 6, delay: "0.2s", duration: "10.5s" },
  { left: "88%", top: "70%", size: 3, delay: "1.8s", duration: "8.5s" },
  { left: "12%", top: "48%", size: 4, delay: "2.4s", duration: "11.5s" },
  { left: "92%", top: "42%", size: 5, delay: "0.6s", duration: "9s" },
] as const;

export function LoginShell({
  title,
  subtitle,
  children,
  className,
  exiting = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  exiting?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-screen w-full items-center justify-center overflow-hidden px-margin-mobile py-xl transition-[filter,transform,opacity] duration-700 md:px-margin-desktop",
        exiting && "scale-[1.02] opacity-0 blur-sm",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklch,var(--secondary)_28%,transparent),transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_100%,color-mix(in_oklch,var(--secondary-container)_55%,transparent),transparent_50%),radial-gradient(ellipse_45%_35%_at_0%_80%,color-mix(in_oklch,var(--primary)_6%,transparent),transparent_45%),var(--background)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] animate-[login-grid-drift_28s_linear_infinite] [background-image:linear-gradient(color-mix(in_oklch,var(--outline-variant)_55%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklch,var(--outline-variant)_55%,transparent)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-secondary-container/40 blur-3xl animate-[login-float_10s_ease-in-out_infinite]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/5 h-64 w-64 rounded-full bg-primary/5 blur-3xl animate-[login-float_13s_ease-in-out_infinite_reverse]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-secondary/15 blur-2xl animate-[login-pulse_4.5s_ease-in-out_infinite]"
      />

      {PARTICLES.map((particle, index) => (
        <span
          key={index}
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-secondary-container/80 shadow-[0_0_12px_color-mix(in_oklch,var(--secondary)_45%,transparent)] animate-[login-particle_ease-in-out_infinite]"
          style={{
            left: particle.left,
            top: particle.top,
            width: particle.size,
            height: particle.size,
            animationDelay: particle.delay,
            animationDuration: particle.duration,
          }}
        />
      ))}

      <main
        className={cn(
          "relative z-10 w-full max-w-[28rem] animate-[login-rise_0.7s_cubic-bezier(0.22,1,0.36,1)_both]",
          className,
        )}
      >
        <header className="mb-lg flex flex-col items-center text-center">
          <div className="relative mb-md flex h-[11rem] w-[11rem] items-center justify-center sm:h-[13rem] sm:w-[13rem]">
            <span
              aria-hidden
              className="absolute inset-[-10%] rounded-full border border-secondary-container/40 animate-[login-orbit_10s_linear_infinite]"
            />
            <span
              aria-hidden
              className="absolute inset-[-22%] rounded-full border border-dashed border-outline-variant/60 animate-[login-orbit_16s_linear_infinite_reverse]"
            />
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-secondary animate-[login-orbit-dot_10s_linear_infinite]"
            />
            <BrandLogo className="relative z-10 h-full w-full max-h-full max-w-full animate-[login-breathe_5s_ease-in-out_infinite]" />
          </div>
          <p className="text-label-md font-semibold tracking-[0.18em] text-on-surface-variant uppercase animate-[login-rise_0.8s_cubic-bezier(0.22,1,0.36,1)_0.08s_both]">
            {APP_NAME}
          </p>
          <h1 className="mt-sm text-headline-lg tracking-tight text-primary animate-[login-rise_0.85s_cubic-bezier(0.22,1,0.36,1)_0.12s_both]">
            {title}
          </h1>
          <p className="mt-base max-w-[22rem] text-body-md text-on-surface-variant animate-[login-rise_0.9s_cubic-bezier(0.22,1,0.36,1)_0.16s_both]">
            {subtitle}
          </p>
        </header>

        <div className="relative overflow-hidden rounded-2xl bg-surface-container-lowest/90 p-lg shadow-[0_24px_60px_-36px_color-mix(in_oklch,var(--primary)_40%,transparent)] ring-1 ring-outline-variant/70 backdrop-blur-md animate-[login-rise_0.95s_cubic-bezier(0.22,1,0.36,1)_0.2s_both] md:p-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-secondary-container to-transparent animate-[login-shimmer_3.5s_ease-in-out_infinite]"
          />
          {children}
        </div>
      </main>

      {exiting ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md animate-[login-enter-fade_0.35s_ease-out_both]"
          aria-live="polite"
        >
          <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-secondary-container/70 animate-[login-enter-ring_1s_cubic-bezier(0.22,1,0.36,1)_both]"
            />
            <span
              aria-hidden
              className="absolute inset-[-12%] rounded-full border border-primary/20 animate-[login-enter-ring_1.1s_cubic-bezier(0.22,1,0.36,1)_0.05s_both]"
            />
            <BrandLogo className="relative z-10 h-full w-full max-h-full max-w-full animate-[login-enter-logo_0.7s_cubic-bezier(0.22,1,0.36,1)_both]" />
          </div>
          <p className="mt-lg text-title-lg text-primary animate-[login-rise_0.5s_ease-out_0.15s_both]">
            Entrando na suíte…
          </p>
          <p className="mt-base text-label-md text-on-surface-variant animate-[login-rise_0.5s_ease-out_0.25s_both]">
            Preparando seu acesso
          </p>
        </div>
      ) : null}
    </div>
  );
}

export const loginFieldClass =
  "input-glow w-full rounded-xl border border-outline-variant/80 bg-surface-container-low/80 py-md pl-xl pr-sm text-body-md text-on-surface outline-none transition-[border-color,box-shadow,background-color] placeholder:text-outline focus:border-primary focus:bg-surface-container-lowest focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--secondary)_35%,transparent)]";

export const loginFieldWithToggleClass =
  "input-glow w-full rounded-xl border border-outline-variant/80 bg-surface-container-low/80 py-md pl-xl pr-xl text-body-md text-on-surface outline-none transition-[border-color,box-shadow,background-color] placeholder:text-outline focus:border-primary focus:bg-surface-container-lowest focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--secondary)_35%,transparent)]";

export const loginSubmitClass =
  "group flex h-12 w-full items-center justify-center gap-xs rounded-xl bg-primary px-lg text-body-lg font-semibold text-on-primary shadow-[0_14px_28px_-16px_color-mix(in_oklch,var(--primary)_70%,transparent)] transition-[transform,background-color,box-shadow] hover:bg-primary-container hover:shadow-[0_18px_32px_-14px_color-mix(in_oklch,var(--primary)_55%,transparent)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100";
