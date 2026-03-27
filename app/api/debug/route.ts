import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.RAPIDAPI_KEY;
  const keyStatus = key ? `set (${key.slice(0, 8)}...)` : "MISSING";
  
  let apiStatus = "not tested";
  let apiBody = "";
  if (key) {
    try {
      const res = await fetch(
        "https://seeking-alpha21.p.rapidapi.com/analysis/list?symbol=AAPL&page=1",
        {
          headers: {
            "x-rapidapi-key": key,
            "x-rapidapi-host": "seeking-alpha21.p.rapidapi.com",
          },
        }
      );
      const text = await res.text();
      apiStatus = `HTTP ${res.status}`;
      apiBody = text.slice(0, 200);
    } catch (e: unknown) {
      apiStatus = `error: ${String(e).slice(0, 100)}`;
    }
  }

  return NextResponse.json({ keyStatus, apiStatus, apiBody });
}
