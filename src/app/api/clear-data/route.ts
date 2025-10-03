import { NextRequest, NextResponse } from "next/server";
import { vectorStore } from "@/lib/vector-store";
import { fileBasedStore } from "@/lib/file-based-store";
import { getSearchHistoryDB } from "@/lib/search-history";
import fs from "fs";
import path from "path";

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const confirm = searchParams.get("confirm");

    if (confirm !== "true") {
      return NextResponse.json(
        {
          error:
            "Confirmation required. Add ?confirm=true to the request URL to proceed with clearing all data.",
        },
        { status: 400 }
      );
    }

    console.log("Starting data clearing process...");
    const results: any = {};

    // Clear vector store
    try {
      const vector = await vectorStore();
      await vector.clear();
      results.vectorStore = {
        success: true,
        message: "Vector store cleared successfully",
      };
      console.log("Vector store cleared");
    } catch (error) {
      console.error("Error clearing vector store:", error);
      results.vectorStore = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Clear file-based store
    try {
      await fileBasedStore.clear();

      // Also delete the storage file to ensure complete cleanup
      const storagePath = path.join(process.cwd(), "document-storage.json");
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }

      results.fileStore = {
        success: true,
        message: "File-based store cleared successfully",
      };
      console.log("File-based store cleared");
    } catch (error) {
      console.error("Error clearing file-based store:", error);
      results.fileStore = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Clear vector storage file
    try {
      const vectorStoragePath = path.join(process.cwd(), "vector-storage.json");
      if (fs.existsSync(vectorStoragePath)) {
        fs.unlinkSync(vectorStoragePath);
      }
      results.vectorStorageFile = {
        success: true,
        message: "Vector storage file deleted",
      };
      console.log("Vector storage file deleted");
    } catch (error) {
      console.error("Error deleting vector storage file:", error);
      results.vectorStorageFile = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Clear database (search history)
    try {
      const db = getSearchHistoryDB();
      await db.clearSearchHistory();
      results.database = {
        success: true,
        message: "Search history cleared successfully",
      };
      console.log("Database search history cleared");
    } catch (error) {
      console.error("Error clearing database:", error);
      results.database = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Get final stats
    try {
      const vector = await vectorStore();
      const vectorStats = await vector.getStats();
      const fileStats = await fileBasedStore.getStats();
      const db = getSearchHistoryDB();
      const dbHistory = await db.getSearchHistory();
      const dbCount = dbHistory.length;

      results.finalStats = {
        vectorStore: vectorStats,
        fileStore: fileStats,
        database: { searchHistoryCount: dbCount },
      };
    } catch (error) {
      console.error("Error getting final stats:", error);
      results.finalStats = { error: "Could not retrieve final statistics" };
    }

    const allSuccessful = Object.values(results).every(
      (result: any) => result.success !== false
    );

    console.log("Data clearing process completed");

    return NextResponse.json({
      success: allSuccessful,
      message: allSuccessful
        ? "All data stores cleared successfully"
        : "Data clearing completed with some errors",
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in clear data process:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to clear data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to show current data status
export async function GET() {
  try {
    const vector = await vectorStore();
    const vectorStats = await vector.getStats();
    const fileStats = await fileBasedStore.getStats();
    const db = getSearchHistoryDB();
    const dbHistory = await db.getSearchHistory();
    const dbCount = dbHistory.length;

    // Check if storage files exist
    const documentStoragePath = path.join(
      process.cwd(),
      "document-storage.json"
    );
    const vectorStoragePath = path.join(process.cwd(), "vector-storage.json");

    const storageFiles = {
      documentStorage: {
        exists: fs.existsSync(documentStoragePath),
        path: documentStoragePath,
        size: fs.existsSync(documentStoragePath)
          ? fs.statSync(documentStoragePath).size
          : 0,
      },
      vectorStorage: {
        exists: fs.existsSync(vectorStoragePath),
        path: vectorStoragePath,
        size: fs.existsSync(vectorStoragePath)
          ? fs.statSync(vectorStoragePath).size
          : 0,
      },
    };

    return NextResponse.json({
      success: true,
      data: {
        vectorStore: vectorStats,
        fileStore: fileStats,
        database: { searchHistoryCount: dbCount },
        storageFiles,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting data status:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to get data status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
