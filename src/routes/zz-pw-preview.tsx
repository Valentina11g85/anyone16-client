import { createFileRoute } from "@tanstack/react-router";
import { OppHero } from "@/components/opportunities/opp-landing";
import { LockedUniverse } from "@/components/opportunities/opp-paywall";
export const Route = createFileRoute("/zz-pw-preview")({ component: P });
function P() {
  return (
    <section className="mx-auto w-full max-w-6xl overflow-x-clip px-5 pb-10 pt-6 sm:px-8">
      <OppHero signedIn onOffer={() => {}} onHire={() => {}} />
      <LockedUniverse />
    </section>
  );
}
