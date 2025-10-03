import fs from "fs";
import path from "path";
import { OpenAIEmbeddings } from "@langchain/openai";

interface VectorDocument {
  id: string;
  text: string;
  metadata: any;
  embedding: number[];
  norm?: number; // Precomputed L2 norm for efficiency
  timestamp?: number; // Document upload timestamp
}

interface VectorSearchResult {
  id: string;
  text: string;
  metadata: any;
  similarity: number;
  distance: number;
}

class VectorDocumentStore {
  private documents: VectorDocument[] = [];
  private storagePath: string;
  private embeddings: OpenAIEmbeddings;
  private dimension: number = 1536; // OpenAI text-embedding-3-small dimension
  private queryCache: Map<
    string,
    { results: VectorSearchResult[]; timestamp: number }
  > = new Map();
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string) {
    this.storagePath = path.join(process.cwd(), "vector-storage.json");

    this.embeddings = new OpenAIEmbeddings({
      modelName: "text-embedding-3-small",
      openAIApiKey: apiKey,
    });

    this.loadDocuments();
  }

  private loadDocuments() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, "utf8");
        const stored = JSON.parse(data);
        this.documents = stored.documents || [];
        console.log(
          `Loaded ${this.documents.length} vector documents from storage`
        );
      }
    } catch (error) {
      console.error("Error loading vector documents:", error);
      this.documents = [];
    }
  }

  private saveDocuments() {
    try {
      const data = {
        documents: this.documents,
        dimension: this.dimension,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
      console.log(`Saved ${this.documents.length} vector documents to storage`);
    } catch (error) {
      console.error("Error saving vector documents:", error);
    }
  }

  // Calculate L2 norm of a vector
  private calculateNorm(vector: number[]): number {
    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
      sum += vector[i] * vector[i];
    }
    return Math.sqrt(sum);
  }

  // Optimized cosine similarity with precomputed norms
  private cosineSimilarity(
    a: number[],
    b: number[],
    normA?: number,
    normB?: number
  ): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }

    // Use precomputed norms if available, otherwise calculate
    const finalNormA = normA || this.calculateNorm(a);
    const finalNormB = normB || this.calculateNorm(b);

    if (finalNormA === 0 || finalNormB === 0) return 0;

    return dotProduct / (finalNormA * finalNormB);
  }

  // Check if cache entry is still valid
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.cacheTimeout;
  }

  async add(chunks: Array<{ id: string; text: string; metadata: any }>) {
    console.log(`Generating embeddings for ${chunks.length} chunks...`);

    // Generate embeddings for all chunks
    const texts = chunks.map((chunk) => chunk.text);
    const embeddings = await this.embeddings.embedDocuments(texts);

    // Create vector documents with precomputed norms and timestamp
    const currentTimestamp = Date.now();
    const vectorDocs: VectorDocument[] = chunks.map((chunk, index) => {
      const embedding = embeddings[index];
      return {
        id: chunk.id,
        text: chunk.text,
        metadata: chunk.metadata,
        embedding,
        norm: this.calculateNorm(embedding), // Precompute norm for efficiency
        timestamp: currentTimestamp, // Add upload timestamp
      };
    });

    // Add to documents array
    this.documents.push(...vectorDocs);

    this.saveDocuments();
    console.log(`Added ${vectorDocs.length} documents to vector store`);
  }

  async search(
    query: string,
    limit: number = 10,
    minSimilarity: number = 0.15
  ): Promise<VectorSearchResult[]> {
    if (this.documents.length === 0) {
      console.log("No documents in vector store");
      return [];
    }

    // Check cache first (include minSimilarity in cache key)
    const cacheKey = `${query}_${limit}_${minSimilarity}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) {
      console.log(`Returning cached results for: "${query}"`);
      return cached.results;
    }

    console.log(
      `Vector searching for: "${query}" in ${this.documents.length} documents (minSimilarity: ${minSimilarity})`
    );

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.embeddings.embedQuery(query);
      const queryNorm = this.calculateNorm(queryEmbedding);

      // Use a priority queue approach for better efficiency
      const results: VectorSearchResult[] = [];

      for (const doc of this.documents) {
        const vectorSimilarity = this.cosineSimilarity(
          queryEmbedding,
          doc.embedding,
          queryNorm,
          doc.norm
        );

        // Calculate exact phrase match boost
        const exactMatchBoost = this.calculateExactMatchBoost(query, doc.text);

        // Combine vector similarity with exact match boost
        const finalSimilarity = Math.min(
          1.0,
          vectorSimilarity + exactMatchBoost
        );

        if (finalSimilarity > minSimilarity) {
          // Extract only the relevant section instead of the whole document
          const relevantSection = this.extractRelevantSection(query, doc.text);

          results.push({
            id: doc.id,
            text: relevantSection,
            metadata: doc.metadata,
            similarity: finalSimilarity,
            distance: 1 - finalSimilarity,
          });
        }
      }

      // Sort by similarity (highest first), then by timestamp (latest first) for same similarity
      const sortedResults = results.sort((a, b) => {
        // First sort by similarity (highest first)
        if (Math.abs(a.similarity - b.similarity) > 0.01) {
          return b.similarity - a.similarity;
        }
        // If similarity is very close, sort by timestamp (latest first)
        const aTimestamp = a.metadata?.timestamp || 0;
        const bTimestamp = b.metadata?.timestamp || 0;
        return bTimestamp - aTimestamp;
      });

      // Deduplicate by document - keep only the top chunk per document
      const deduplicatedResults = this.deduplicateByDocument(
        sortedResults,
        limit
      );

      // Cache the results
      this.queryCache.set(cacheKey, {
        results: deduplicatedResults,
        timestamp: Date.now(),
      });

      // Clean old cache entries periodically
      if (this.queryCache.size > 100) {
        this.cleanCache();
      }

      console.log(
        `Vector search returned ${deduplicatedResults.length} results (filtered by minSimilarity: ${minSimilarity}, deduplicated by document)`
      );
      if (deduplicatedResults.length > 0) {
        console.log(
          `Top result similarity: ${deduplicatedResults[0].similarity}`
        );
      }

      return deduplicatedResults;
    } catch (error) {
      console.error("Error in vector search:", error);
      return [];
    }
  }

  // Calculate exact phrase match boost
  private calculateExactMatchBoost(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Check for exact phrase match (highest boost)
    if (textLower.includes(queryLower)) {
      // Count occurrences and calculate boost
      const occurrences = (textLower.match(new RegExp(queryLower, "g")) || [])
        .length;
      return Math.min(0.5, occurrences * 0.2); // Max 0.5 boost
    }

    // Check for individual word matches
    const queryWords = queryLower
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const textWords = textLower.split(/\s+/);

    let wordMatches = 0;
    for (const word of queryWords) {
      if (textWords.includes(word)) {
        wordMatches++;
      }
    }

    // Boost based on word match ratio
    if (queryWords.length > 0) {
      const matchRatio = wordMatches / queryWords.length;
      return matchRatio * 0.2; // Max 0.2 boost for word matches
    }

    return 0;
  }

  // Extract relevant section from document based on query
  private extractRelevantSection(query: string, text: string): string {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();

    // Look for section headers that match the query
    const sectionPatterns = [
      // Exact section headers like "BUSINESS UPDATES:"
      new RegExp(
        `^[A-Z\\s]*${queryLower.replace(/\s+/g, "\\s+")}[A-Z\\s]*:?$`,
        "gmi"
      ),
      // Section headers with colons
      new RegExp(
        `^[A-Z\\s]*${queryLower.replace(/\s+/g, "\\s+")}[A-Z\\s]*:`,
        "gmi"
      ),
      // Partial matches in headers
      new RegExp(
        `^[A-Z\\s]*${queryLower.split(" ").join("[A-Z\\s]*")}[A-Z\\s]*:?$`,
        "gmi"
      ),
    ];

    for (const pattern of sectionPatterns) {
      const match = pattern.exec(text);
      if (match) {
        const sectionStart = match.index;
        const sectionHeader = match[0];

        // Find the end of this section (next section header or end of text)
        const nextSectionPattern = /^[A-Z\s]+:?\s*$/gm;
        nextSectionPattern.lastIndex = sectionStart + sectionHeader.length;
        const nextMatch = nextSectionPattern.exec(text);

        const sectionEnd = nextMatch ? nextMatch.index : text.length;
        const sectionText = text.slice(sectionStart, sectionEnd).trim();

        if (sectionText.length > 0) {
          return sectionText;
        }
      }
    }

    // If no section header found, look for the query phrase and extract surrounding context
    const queryIndex = textLower.indexOf(queryLower);
    if (queryIndex !== -1) {
      // Extract 500 characters before and after the query
      const contextStart = Math.max(0, queryIndex - 500);
      const contextEnd = Math.min(text.length, queryIndex + query.length + 500);
      const contextText = text.slice(contextStart, contextEnd).trim();

      // Try to find sentence boundaries
      const sentences = contextText.split(/[.!?]\s+/);
      if (sentences.length > 1) {
        // Return sentences that contain the query
        const relevantSentences = sentences.filter((sentence) =>
          sentence.toLowerCase().includes(queryLower)
        );
        if (relevantSentences.length > 0) {
          return relevantSentences.join(". ") + ".";
        }
      }

      return contextText;
    }

    // Fallback: return the original text if no specific section found
    return text;
  }

  // Deduplicate results by document - keep only the top chunk per document
  private deduplicateByDocument(
    results: VectorSearchResult[],
    limit: number
  ): VectorSearchResult[] {
    const documentMap = new Map<string, VectorSearchResult>();
    const deduplicatedResults: VectorSearchResult[] = [];

    // Group results by document filename
    for (const result of results) {
      const filename = result.metadata?.filename || "unknown";

      // Keep only the first (highest similarity) result for each document
      if (!documentMap.has(filename)) {
        documentMap.set(filename, result);
        deduplicatedResults.push(result);

        // Stop when we have enough results
        if (deduplicatedResults.length >= limit) {
          break;
        }
      }
    }

    console.log(
      `Deduplication: ${results.length} results -> ${deduplicatedResults.length} unique documents`
    );
    return deduplicatedResults;
  }

  // Clean expired cache entries
  private cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (!this.isCacheValid(value.timestamp)) {
        this.queryCache.delete(key);
      }
    }
  }

  async getAll(): Promise<VectorDocument[]> {
    return [...this.documents];
  }

  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    avgChunkSize: number;
    indexSize: number;
  }> {
    const totalChunks = this.documents.length;
    const avgChunkSize =
      totalChunks > 0
        ? this.documents.reduce((sum, doc) => sum + doc.text.length, 0) /
          totalChunks
        : 0;

    const uniqueFiles = new Set(
      this.documents.map((doc) => doc.metadata.filename)
    ).size;

    return {
      totalDocuments: uniqueFiles,
      totalChunks,
      avgChunkSize: Math.round(avgChunkSize),
      indexSize: this.documents.length,
    };
  }

  async clear() {
    this.documents = [];
    this.queryCache.clear();
    this.saveDocuments();
    console.log("Vector store cleared");
  }

  // Get search suggestions based on document content
  async getSearchSuggestions(
    query: string,
    limit: number = 5
  ): Promise<string[]> {
    const queryLower = query.toLowerCase();
    const suggestions = new Set<string>();

    for (const doc of this.documents) {
      const textLower = doc.text.toLowerCase();
      const words = textLower.split(/\s+/).filter(
        (word) =>
          word.length > 3 &&
          word.includes(queryLower) &&
          !word.includes(queryLower + queryLower) // Avoid duplicates
      );

      words.forEach((word) => suggestions.add(word));
    }

    return Array.from(suggestions).slice(0, limit);
  }
}

export const vectorStore = async () => {
  const baseUrl =
    "https://us-central1-challenge-hub-f0939.cloudfunctions.net/api"; // your API server
  const endpoint = "/api-key";

  // Fetch API key from your server
  const res = await fetch(`${baseUrl}${endpoint}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch API key: ${res.statusText}`);
  }

  const data = await res.json();

  return new VectorDocumentStore(data.openaiApiKey);
};
