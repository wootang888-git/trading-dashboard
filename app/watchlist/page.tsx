import { getWatchlist } from "@/lib/supabase";
import WatchlistManager from "./WatchlistManager";

export const revalidate = 0; // always fresh

export default async function WatchlistPage() {
  const items = await getWatchlist();
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <WatchlistManager initial={items} />
      </div>
    </main>
  );
}
