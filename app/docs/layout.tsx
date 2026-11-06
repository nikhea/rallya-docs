import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { getSource } from "@/lib/source";
import { DocsAssistant } from "./docs-assistant";

export default async function Layout({ children }: { children: ReactNode }) {
  const { source } = await getSource();

  return (
    <>
      <DocsLayout
        tree={source.pageTree}
        githubUrl="https://github.com/nikhea/rallya"
        nav={{
          title: "Rallya Docs",
        }}
      >
        {children}
      </DocsLayout>
      {/* Floating "Ask AI" assistant, mounted only on /docs/** */}
      <DocsAssistant />
    </>
  );
}
