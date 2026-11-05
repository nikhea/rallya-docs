import { parseBody } from "next-sanity/webhook";
import { revalidatePath } from "next/cache";
import type { NextRequest } from "next/server";
import { invalidateSource } from "@/lib/source";

type SanityWebhookBody = {
  _id?: string;
  _type?: string;
  slug?: { current?: string };
};

export const POST = async (req: NextRequest) => {
  const secret = process.env.SANITY_REVALIDATE_SECRET;
  if (!secret) {
    return Response.json(
      { error: "SANITY_REVALIDATE_SECRET is not configured" },
      { status: 500 },
    );
  }

  const { body, isValidSignature } = await parseBody<SanityWebhookBody>(
    req,
    secret,
  );

  if (isValidSignature === false) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const type = body?._type;
  if (type !== "docPage" && type !== "docSection") {
    return Response.json({ ok: true, ignored: type ?? null });
  }

  // drop the in-process source cache; the next request re-fetches Sanity
  invalidateSource();

  // the literal path when we know it, plus the catch-all page pattern and the
  // docs layout (sidebar tree) — llms endpoints revalidate separately
  if (type === "docPage" && body?.slug?.current) {
    revalidatePath(`/docs/${body.slug.current}`);
  }
  revalidatePath("/docs/[[...slug]]", "page");
  revalidatePath("/docs", "layout");
  revalidatePath("/llms.txt");
  revalidatePath("/llms-full.txt");
  revalidatePath("/llms.mdx/docs", "layout");

  return Response.json({
    ok: true,
    revalidated: new Date().toISOString(),
    document: { type, id: body?._id ?? null, slug: body?.slug?.current ?? null },
  });
};
