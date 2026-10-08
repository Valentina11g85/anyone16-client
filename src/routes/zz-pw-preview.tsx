import { createFileRoute } from "@tanstack/react-router";
import { OppHero } from "@/components/opportunities/opp-landing";
import { MarketColumns } from "@/components/opportunities/opp-market";
export const Route = createFileRoute("/zz-pw-preview")({ component: P });
function P() {
  return (
    <section className="mx-auto w-full max-w-6xl overflow-x-clip px-5 pb-10 pt-6 sm:px-8">
      <OppHero signedIn onOffer={() => {}} onHire={() => {}} />
      <MarketColumns seekLocked listings={[]} signedIn providerFor={() => null} onOpen={() => {}} onNew={() => {}} onSeeAll={() => {}} />
    </section>
  );
}
