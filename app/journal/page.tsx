import { Suspense } from "react";
import { getTrades } from "@/lib/supabase";
import JournalManager from "./JournalManager";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const trades = await getTrades();
  return (
    <Suspense fallback={null}>
      <JournalManager initial={trades} />
    </Suspense>
  );
}
