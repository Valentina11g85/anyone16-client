import { BadgeCheck } from "lucide-react";

import { initials, type WorkerProfile } from "@/lib/marketplace-model";

export function WorkerAvatar({
  worker,
  size = "md",
}: {
  worker: WorkerProfile;
  size?: "sm" | "md" | "lg";
}) {
  const dimension =
    size === "lg" ? "size-16 text-xl" : size === "sm" ? "size-10 text-xs" : "size-12 text-sm";
  const verified = worker.verification.identityVerified;
  return (
    <span className="relative inline-flex shrink-0">
      {worker.photoUrl ? (
        <img
          src={worker.photoUrl}
          alt=""
          className={`${dimension} rounded-2xl object-cover`}
          aria-hidden="true"
        />
      ) : (
        <span
          className={`${dimension} grid place-items-center rounded-2xl bg-brand-soft font-display font-extrabold text-primary`}
          aria-hidden="true"
        >
          {initials(worker.name)}
        </span>
      )}
      {verified && (
        <BadgeCheck
          className="absolute -bottom-1 -right-1 size-5 rounded-full bg-card text-primary"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
