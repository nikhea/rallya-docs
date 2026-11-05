import Studio from "./studio";

export const metadata = {
  title: "Rallya Docs Studio",
  description: "Edit Rallya documentation content",
};

export { viewport } from "next-sanity/studio";

export default function StudioPage() {
  return <Studio />;
}
