import { getSource } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const { docsLlms } = await getSource();
  return new Response(await docsLlms.full());
}
