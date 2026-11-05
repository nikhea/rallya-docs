import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { getSource } from "@/lib/source";

export default async function Layout({ children }: { children: ReactNode }) {
  const { source } = await getSource();

  return (
    <DocsLayout
      tree={source.pageTree}
      githubUrl="https://github.com/nikhea/rallya"
      nav={{
        title: "Rallya Docs",
      }}
    >
      {children}
    </DocsLayout>
  );
}
