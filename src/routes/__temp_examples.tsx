import { createFileRoute } from "@tanstack/react-router";
import ideaDriver from "@/assets/home/idea-driver.jpg";
import "@/styles.css";

function TempExamples() {
  return (
    <main style={{ background: "var(--background)", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <button type="button" data-accent="blue" className="object-tile group">
            <span className="object-stage">
              <img src={ideaDriver} alt="" width={440} height={440} loading="lazy" />
              <span className="object-caption">
                <span className="block font-display text-[15px] font-semibold leading-tight text-foreground">
                  Conductor por horas
                </span>
                <span className="mt-1 block text-[11.5px] leading-snug text-muted-foreground">
                  Un conductor cuando lo necesites.
                </span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/__temp_examples")({
  component: TempExamples,
});
