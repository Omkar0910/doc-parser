import { NextRequest, NextResponse } from "next/server";
import { fileBasedStore } from "@/lib/file-based-store";
import { vectorStore } from "@/lib/vector-store";
import { getSearchHistoryDB } from "@/lib/search-history";
import { generateAnswerFromDocuments } from "@/lib/ai-extraction";

export async function POST(request: NextRequest) {
  try {
    const {
      query,
      limit = 10,
      generateAnswer = true,
      minSimilarity = 0.4,
      metadataFilter,
    } = await request.json();

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Use vector store for semantic search (primary), fallback to file-based store
    console.log("Searching vector store...");
    console.log(
      `Query: "${query}", Limit: ${limit}, Generate Answer: ${generateAnswer}, MinSimilarity: ${minSimilarity}`
    );
    if (metadataFilter) {
      console.log("Metadata Filter:", JSON.stringify(metadataFilter));
    }

    let searchResults: any[] = [];

    try {
      // Try vector search first with enhanced features
      const vector = await vectorStore();
      searchResults = await vector.search(
        query,
        limit,
        minSimilarity,
        metadataFilter
      );
      console.log(`Vector search returned ${searchResults.length} results`);

      // If vector search returns no results, fallback to file-based search
      if (searchResults.length === 0) {
        console.log("No vector results, falling back to file-based search...");
        searchResults = await fileBasedStore.search(query, limit);
        console.log(
          `File-based search returned ${searchResults.length} results`
        );
      }
    } catch (vectorError) {
      console.error(
        "Vector search failed, falling back to file-based search:",
        vectorError
      );
      searchResults = await fileBasedStore.search(query, limit);
      console.log(`File-based search returned ${searchResults.length} results`);
    }

    // Generate AI-powered answer if requested
    let aiAnswer = null;
    if (generateAnswer && searchResults.length > 0) {
      console.log("Generating AI answer...");
      try {
        aiAnswer = await generateAnswerFromDocuments(query, searchResults);
        console.log("AI answer generated successfully");
      } catch (answerError) {
        console.error("Failed to generate AI answer:", answerError);
        // Continue without AI answer
      }
    }

    // Save search to history
    try {
      const db = getSearchHistoryDB();
      await db.addSearchHistory(query.trim(), searchResults.length);
    } catch (historyError) {
      console.error("Failed to save search history:", historyError);
      // Don't fail the search if history saving fails
    }

    const response: any = {
      query,
      results: searchResults,
      total: searchResults.length,
    };

    // Include AI answer if generated
    if (aiAnswer) {
      response.answer = aiAnswer.answer;
      response.sources = aiAnswer.sources;
      response.confidence = aiAnswer.confidence;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
