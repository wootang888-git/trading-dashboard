import { NextRequest, NextResponse } from "next/server";

const HOST = "seeking-alpha21.p.rapidapi.com";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ articles: [] });
  if (!RAPIDAPI_KEY) return NextResponse.json({ articles: [] });

  try {
    const res = await fetch(
      `https://${HOST}/analysis/list?symbol=${ticker.toUpperCase()}&page=1`,
      {
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": HOST,
        },
        next: { revalidate: 3600 }, // cache 1h
      }
    );
    if (!res.ok) return NextResponse.json({ articles: [] });
    const data = await res.json();

    interface SAItem {
      id: string;
      attributes?: {
        title?: string;
        publishOn?: string | null;
        isPaywalled?: boolean;
      };
    }

    const articles = (data?.data ?? []).slice(0, 5).map((item: SAItem) => ({
      id: item.id,
      title: item.attributes?.title ?? "",
      publishOn: item.attributes?.publishOn ?? null,
      isPaywalled: item.attributes?.isPaywalled ?? false,
    }));

    return NextResponse.json({ articles });
  } catch {
    return NextResponse.json({ articles: [] });
  }
}
