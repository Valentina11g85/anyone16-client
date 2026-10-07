/** Minimal, safe markdown renderer for legal texts (headings, lists, bold, quotes). No HTML injection. */
import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

export function LegalMarkdown({ content }: { content: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`my-3 space-y-1.5 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    );
    list = null;
  };
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    const ul = line.match(/^- (.*)$/);
    const ol = line.match(/^\d+\. (.*)$/);
    if (ul || ol) {
      const ordered = Boolean(ol);
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] }; }
      list.items.push((ul ?? ol)![1]!);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const k = blocks.length;
    if (line.startsWith("# ")) blocks.push(<h1 key={k} className="mt-2 font-display text-2xl font-extrabold text-foreground sm:text-3xl">{line.slice(2)}</h1>);
    else if (line.startsWith("## ")) blocks.push(<h2 key={k} className="mt-6 font-display text-lg font-extrabold text-foreground">{line.slice(3)}</h2>);
    else if (line.startsWith("> ")) blocks.push(<p key={k} className="my-3 rounded-2xl border border-border bg-brand-soft p-3 text-sm text-foreground">{inline(line.slice(2))}</p>);
    else blocks.push(<p key={k} className="my-2">{inline(line)}</p>);
  }
  flush();
  return <div className="text-sm leading-relaxed text-muted-foreground">{blocks}</div>;
}
