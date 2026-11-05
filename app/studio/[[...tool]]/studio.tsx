"use client";

// Sanity Studio must live outside the React Server Components graph: the
// studio library resolves `swr` (and friends) via the client bundler only.
import { NextStudio } from "next-sanity/studio";
import config from "@/sanity.config";

export default function Studio() {
  return <NextStudio config={config} />;
}
