import { NextRequest, NextResponse } from "next/server";
import { getSearchHistoryDB } from "@/lib/search-history";

export async function GET() {
  try {
    const db = getSearchHistoryDB();
    const history = await db.getSearchHistory(50);

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching search history:", error);
    return NextResponse.json(
      { error: "Failed to fetch search history" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const db = getSearchHistoryDB();
    await db.clearSearchHistory();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error clearing search history:", error);
    return NextResponse.json(
      { error: "Failed to clear search history" },
      { status: 500 }
    );
  }
}
