import { NextRequest, NextResponse } from "next/server";
import {
  parsePDF,
  parseEmail,
  chunkText,
  DocumentChunk,
} from "@/lib/document-parser";
import { extractStructuredInfo } from "@/lib/ai-extraction";
import { fileBasedStore } from "@/lib/file-based-store";
import { vectorStore } from "@/lib/vector-store";
import { parseMultipartFormData } from "@/lib/multer-config";

export async function POST(request: NextRequest) {
  try {
    // Parse form data using multer configuration
    const { fields, files } = await parseMultipartFormData(request);
    const multerFile = files.file?.[0];

    if (!multerFile) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = multerFile.buffer;
    const filename = multerFile.originalname;
    const fileType = multerFile.mimetype;

    console.log(
      `Processing file: ${filename}, type: ${fileType}, size: ${multerFile.size} bytes`
    );

    // Parse document based on type
    let text: string;
    if (fileType === "application/pdf") {
      console.log("Parsing PDF...");
      text = await parsePDF(buffer, filename);
    } else if (fileType === "message/rfc822" || filename.endsWith(".eml")) {
      console.log("Parsing email...");
      text = await parseEmail(buffer, filename);
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Only PDF and EML files are allowed." },
        { status: 400 }
      );
    }

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "No text content found in document" },
        { status: 400 }
      );
    }

    console.log(`Extracted text length: ${text.length}`);

    // Extract structured information
    console.log("Extracting structured information...");
    const metadata = await extractStructuredInfo(text, filename);

    // Chunk the text with optimized parameters
    console.log("Chunking text...");
    const chunks = chunkText(text, 1200, 150); // Slightly larger chunks, less overlap for better topic coherence

    // Process each chunk
    const chunkIds: string[] = [];
    const chunkTexts: string[] = [];
    const chunkMetadata: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${filename}_chunk_${i}`;
      chunkIds.push(chunkId);
      chunkTexts.push(chunks[i]);
      chunkMetadata.push({
        ...metadata,
        chunkIndex: i,
        totalChunks: chunks.length,
        chunkSize: chunks[i].length,
        timestamp: Date.now(),
      });
    }

    // Store in both file-based store (fallback) and vector store (primary)
    console.log("Storing documents in both stores...");
    const documentChunks = chunkIds.map((id, index) => ({
      id,
      text: chunkTexts[index],
      metadata: chunkMetadata[index],
    }));

    console.log(`About to store ${documentChunks.length} chunks`);

    // Store in vector store (primary for semantic search)
    try {
      const vector = await vectorStore();
      await vector.add(documentChunks);
      console.log("Documents stored in vector store successfully");
    } catch (vectorError) {
      console.error("Error storing documents in vector store:", vectorError);
      // Continue with file-based store as fallback
    }

    // Store in file-based store (reliable fallback)
    try {
      await fileBasedStore.add(documentChunks);
      console.log("Documents stored in file-based storage successfully");
    } catch (storeError) {
      console.error("Error storing documents in file-based store:", storeError);
      // Don't throw error, vector store is primary
    }

    // Verify storage
    try {
      const vector = await vectorStore();
      const vectorStats = await vector.getStats();
      const fileStats = await fileBasedStore.getStats();
      console.log("Vector store stats:", vectorStats);
      console.log("File store stats:", fileStats);
    } catch (statsError) {
      console.error("Error getting storage stats:", statsError);
    }

    console.log("Upload completed successfully");
    return NextResponse.json({
      success: true,
      filename,
      chunks: chunks.length,
      metadata,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Handle multer-specific errors
    if (
      error instanceof Error &&
      error.message.includes("Unsupported file type")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Handle multer file size errors
    if (error instanceof Error && (error as any).code === "LIMIT_FILE_SIZE") {
      return NextResponse.json(
        { error: "File size too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: `Failed to process document: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      },
      { status: 500 }
    );
  }
}
