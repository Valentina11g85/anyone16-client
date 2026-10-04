import { createFileRoute } from "@tanstack/react-router";
import { StageOneApp } from "@/components/stage-one-app";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AnyOne¹⁶ — Anyone can help." },
      {
        name: "description",
        content:
          "Necesitas algo. Alguien puede ayudarte. Conoce la experiencia inicial de AnyOne¹⁶.",
      },
      { property: "og:title", content: "AnyOne¹⁶ — Anyone can help." },
      {
        property: "og:description",
        content: "Una nueva forma de conectar con personas dispuestas a ayudar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return <StageOneApp />;
}
