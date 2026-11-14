import { NextResponse } from "next/server";
import { stagingWordPublishStatus } from "@/app/(authenticated)/admin/teaching-dictionary/staging-word-publish-actions";

export async function GET(request: Request, { params }: { params: Promise<{ wordId: string }> }) {
  const { wordId } = await params;
  const search = new URL(request.url).searchParams;
  return NextResponse.json(await stagingWordPublishStatus(wordId, search.get("skill") ?? "", search.get("sense") ?? ""),
    { headers: { "Cache-Control": "private, no-store" } });
}
