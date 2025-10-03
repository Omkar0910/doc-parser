import { NextRequest, NextResponse } from "next/server";
import { fileBasedStore } from "@/lib/file-based-store";
import { vectorStore } from "@/lib/vector-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const query = searchParams.get("query");

    if (action === "suggestions" && query) {
      const vector = await vectorStore();
      const suggestions = await vector.getSearchSuggestions(query, 5);
      return NextResponse.json({ suggestions });
    }

    if (action === "stats") {
      const vector = await vectorStore();
      const vectorStats = await vector.getStats();
      const fileStats = await fileBasedStore.getStats();
      return NextResponse.json({
        vector: vectorStats,
        file: fileStats,
      });
    }

    if (action === "debug") {
      const vector = await vectorStore();
      const vectorDocs = await vector.getAll();
      const fileDocs = await fileBasedStore.getAll();
      return NextResponse.json({
        vector: {
          totalDocs: vectorDocs.length,
          sampleDoc: vectorDocs[0] || null,
          firstFewIds: vectorDocs.slice(0, 3).map((doc) => doc.id),
        },
        file: {
          totalDocs: fileDocs.length,
          sampleDoc: fileDocs[0] || null,
          firstFewIds: fileDocs.slice(0, 3).map((doc) => doc.id),
        },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Search suggestions error:", error);
    return NextResponse.json(
      { error: "Failed to get suggestions" },
      { status: 500 }
    );
  }
}
