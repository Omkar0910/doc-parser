import { ChatOpenAI } from "@langchain/openai";
import { DocumentMetadata } from "./document-parser";

async function getOpenAIKey() {
  const baseUrl =
    "https://us-central1-challenge-hub-f0939.cloudfunctions.net/api"; // your API server
  const endpoint = "/api-key";

  const res = await fetch(`${baseUrl}${endpoint}`);
  if (!res.ok) {
    console.error(`Failed to fetch API key: ${res.statusText}`);
    throw new Error(`Failed to fetch API key: ${res.statusText}`);
  }
  const data = await res.json();

  const llm = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
    apiKey: data.openaiApiKey,
  });

  return llm;
}

export const extractStructuredInfo = async (
  text: string,
  filename: string
): Promise<DocumentMetadata> => {
  const prompt = `
Extract structured information from the following document text. Return ONLY valid JSON with the exact structure specified below.

Document filename: ${filename}

Document text:
${text.substring(0, 4000)} // Limit to avoid token limits

Extract and return JSON with this exact structure:
{
  "filename": "${filename}",
  "documentType": "invoice|email|report|contract|legal|medical|financial|technical|academic|government|personal|other",
  "date": "YYYY-MM-DD format or null",
  "identifiers": ["array of IDs, numbers, reference codes, PO numbers, tracking numbers, case numbers, account numbers"],
  "people": ["array of person names, job titles, signatories, authors, recipients, witnesses"],
  "organizations": ["array of company names, departments, institutions, agencies, law firms, hospitals"],
  "locations": ["array of addresses, cities, countries, states, regions, facilities"],
  "contacts": ["array of emails, phone numbers, URLs, fax numbers, social media handles"],
  "financials": {
    "amounts": [array of monetary amounts as numbers],
    "currency": "currency code like USD, EUR, etc. or null"
  },
  "keywords": ["array of subjects, project names, tags, topics, categories, themes"],
  "summary": "2-3 sentence summary of the document"
}

Rules:
- Return ONLY the JSON object, no other text
- Use null for missing values, not undefined
- Extract ALL possible information, be thorough
- For financials.amounts, extract numbers only (no currency symbols)
- For dates, use YYYY-MM-DD format
- Be conservative with documentType classification
- Handle any type of document: legal documents, medical records, technical manuals, academic papers, government forms, personal correspondence, etc.
- Extract all relevant entities regardless of document type
- For identifiers, include any reference numbers, codes, or tracking information
- For people, include all named individuals with their roles if mentioned
- For organizations, include all mentioned entities, companies, institutions
- For locations, include all geographical references
- For contacts, include all communication methods mentioned
- For keywords, extract main topics, subjects, and themes
`;

  try {
    const llm = await getOpenAIKey();
    const response = await llm.invoke(prompt);
    const jsonStr = response.content as string;

    // Clean the response to extract just the JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const metadata = JSON.parse(jsonMatch[0]) as DocumentMetadata;

    // Validate and clean the data
    return {
      filename: metadata.filename || filename,
      documentType: metadata.documentType || "other",
      date: metadata.date || undefined,
      identifiers: metadata.identifiers || [],
      people: metadata.people || [],
      organizations: metadata.organizations || [],
      locations: metadata.locations || [],
      contacts: metadata.contacts || [],
      financials: {
        amounts: metadata.financials?.amounts || [],
        currency: metadata.financials?.currency || undefined,
      },
      keywords: metadata.keywords || [],
      summary: metadata.summary || "No summary available",
    };
  } catch (error) {
    console.error("Error extracting structured info:", error);

    // Check if it's a quota error
    if (error instanceof Error && error.message.includes("quota")) {
      console.log("OpenAI quota exceeded, using fallback extraction");
      return createFallbackMetadata(text, filename);
    }

    // Return minimal metadata on error
    return {
      filename,
      documentType: "other",
      date: undefined,
      identifiers: [],
      people: [],
      organizations: [],
      locations: [],
      contacts: [],
      financials: {
        amounts: [],
        currency: undefined,
      },
      keywords: [],
      summary: "Failed to extract structured information",
    };
  }
};

// Fallback extraction when OpenAI API is not available
const createFallbackMetadata = (
  text: string,
  filename: string
): DocumentMetadata => {
  const metadata: DocumentMetadata = {
    filename,
    documentType: "other",
    date: undefined,
    identifiers: [],
    people: [],
    organizations: [],
    locations: [],
    contacts: [],
    financials: {
      amounts: [],
      currency: undefined,
    },
    keywords: [],
    summary: "Document processed without AI extraction (API quota exceeded)",
  };

  // Basic regex-based extraction
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const phoneRegex = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const moneyRegex = /\$[\d,]+\.?\d*/g;
  const dateRegex = /\b\d{4}-\d{2}-\d{2}\b/g;

  // Extract emails
  const emails = text.match(emailRegex) || [];
  metadata.contacts = [...(metadata.contacts || []), ...emails];

  // Extract phone numbers
  const phones = text.match(phoneRegex) || [];
  metadata.contacts = [...(metadata.contacts || []), ...phones];

  // Extract monetary amounts
  const amounts = text.match(moneyRegex) || [];
  if (metadata.financials) {
    metadata.financials.amounts = amounts
      .map((amount) => parseFloat(amount.replace(/[$,]/g, "")))
      .filter((amount) => !isNaN(amount));
  }

  // Extract dates
  const dates = text.match(dateRegex) || [];
  if (dates.length > 0) {
    metadata.date = dates[0];
  }

  // Basic document type detection
  if (text.toLowerCase().includes("invoice")) {
    metadata.documentType = "invoice";
  } else if (text.toLowerCase().includes("contract")) {
    metadata.documentType = "contract";
  } else if (text.toLowerCase().includes("report")) {
    metadata.documentType = "report";
  } else if (
    text.toLowerCase().includes("@") &&
    text.toLowerCase().includes("subject:")
  ) {
    metadata.documentType = "email";
  }

  return metadata;
};

// Generate AI-powered answers based on document search results
export const generateAnswerFromDocuments = async (
  query: string,
  searchResults: any[],
  maxContextLength: number = 4000
): Promise<{
  answer: string;
  sources: string[];
  confidence: number;
}> => {
  if (!searchResults || searchResults.length === 0) {
    return {
      answer:
        "I couldn't find any relevant information in the uploaded documents to answer your question.",
      sources: [],
      confidence: 0,
    };
  }

  // Filter and rank results by relevance and quality
  const filteredResults = filterAndRankResults(query, searchResults);

  if (filteredResults.length === 0) {
    return {
      answer:
        "I couldn't find any relevant information in the uploaded documents to answer your question.",
      sources: [],
      confidence: 0,
    };
  }

  // Prepare context from filtered results
  const contextChunks = filteredResults
    .slice(0, 5) // Use top 5 results
    .map((result, index) => {
      const source = result.metadata?.filename || `Document ${index + 1}`;
      const similarity = result.similarity || 0;
      return `[Source: ${source} | Relevance: ${(similarity * 100).toFixed(
        1
      )}%]\n${result.text}\n`;
    })
    .join("\n---\n");

  // Truncate context if too long
  const truncatedContext =
    contextChunks.length > maxContextLength
      ? contextChunks.substring(0, maxContextLength) + "..."
      : contextChunks;

  const sources = filteredResults
    .slice(0, 5)
    .map((result) => result.metadata?.filename || "Unknown document");

  // Enhanced prompt with better instructions
  const prompt = `
You are an AI assistant that answers questions based on the content of uploaded documents. Use ONLY the information provided in the context below to answer the user's question.

User Question: ${query}

Context from uploaded documents:
${truncatedContext}

Instructions:
1. Answer the question based ONLY on the information provided in the context above
2. If the answer is not found in the context, say "I couldn't find specific information about this in the uploaded documents"
3. Be concise but comprehensive - provide a clear, well-structured answer
4. Include specific details, numbers, dates, names, or other relevant information from the documents
5. If you reference information, mention which document it came from
6. If the question asks for information that spans multiple documents, synthesize the information clearly
7. For financial questions, provide specific amounts and details
8. For contact information, provide complete details
9. For business information, provide specific facts and figures
10. If the query asks for a summary or overview, provide a structured summary
11. If the query asks for specific data points, extract and present them clearly
12. Use the relevance scores to prioritize information from more relevant sources
13. If there are conflicting information across documents, mention this and provide both perspectives
14. Format your answer for readability with proper structure and formatting

Answer:`;

  try {
    const llm = await getOpenAIKey();
    const response = await llm.invoke(prompt);
    const answer = response.content as string;

    // Calculate confidence based on multiple factors
    const confidence = calculateAnswerConfidence(
      query,
      filteredResults,
      answer
    );

    return {
      answer: answer.trim(),
      sources,
      confidence: Math.round(confidence * 100) / 100,
    };
  } catch (error) {
    console.error("Error generating AI answer:", error);

    // Fallback to simple text-based answer
    const fallbackAnswer = generateFallbackAnswer(query, searchResults);

    return {
      answer: fallbackAnswer,
      sources,
      confidence: 0.3,
    };
  }
};

// Filter and rank search results by relevance and quality
function filterAndRankResults(query: string, searchResults: any[]): any[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((word) => word.length > 2);

  return searchResults
    .map((result) => {
      const text = result.text || "";
      const textLower = text.toLowerCase();

      // Calculate relevance score
      let relevanceScore = result.similarity || 0;

      // Boost score for exact phrase matches
      if (textLower.includes(queryLower)) {
        relevanceScore += 0.2;
      }

      // Boost score for individual word matches
      const wordMatches = queryWords.filter((word) =>
        textLower.includes(word)
      ).length;
      const wordMatchRatio =
        queryWords.length > 0 ? wordMatches / queryWords.length : 0;
      relevanceScore += wordMatchRatio * 0.1;

      // Boost score for longer, more informative chunks
      if (text.length > 200) {
        relevanceScore += 0.05;
      }

      // Penalize very short chunks
      if (text.length < 50) {
        relevanceScore -= 0.1;
      }

      return {
        ...result,
        relevanceScore: Math.min(1.0, relevanceScore),
      };
    })
    .filter((result) => result.relevanceScore > 0.1) // Filter out low-relevance results
    .sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance score
}

// Calculate confidence based on multiple factors
function calculateAnswerConfidence(
  query: string,
  results: any[],
  answer: string
): number {
  // Base confidence from search result similarities
  const avgSimilarity =
    results.reduce((sum, result) => sum + (result.similarity || 0), 0) /
    results.length;

  // Boost confidence if answer contains specific information
  let confidence = avgSimilarity;

  // Check if answer contains numbers, dates, or specific details
  const hasNumbers = /\d+/.test(answer);
  const hasDates = /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}/.test(answer);
  const hasSpecifics = hasNumbers || hasDates;

  if (hasSpecifics) {
    confidence += 0.1;
  }

  // Check if answer directly addresses the query
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const answerLower = answer.toLowerCase();
  const queryWordMatches = queryWords.filter((word) =>
    answerLower.includes(word)
  ).length;
  const queryMatchRatio =
    queryWords.length > 0 ? queryWordMatches / queryWords.length : 0;

  confidence += queryMatchRatio * 0.1;

  // Penalize if answer is too short or generic
  if (answer.length < 50) {
    confidence -= 0.2;
  }

  if (answer.includes("I couldn't find") || answer.includes("not found")) {
    confidence -= 0.3;
  }

  return Math.min(0.95, Math.max(0.1, confidence));
}

// Fallback answer generation when AI is not available
const generateFallbackAnswer = (
  query: string,
  searchResults: any[]
): string => {
  const queryLower = query.toLowerCase();

  // Extract relevant information based on query type
  if (
    queryLower.includes("financial") ||
    queryLower.includes("revenue") ||
    queryLower.includes("profit")
  ) {
    const financialInfo =
      searchResults
        .map((result) => result.text)
        .join(" ")
        .match(/\$[\d,]+\.?\d*/g) || [];

    if (financialInfo.length > 0) {
      return `Based on the documents, I found these financial figures: ${financialInfo.join(
        ", "
      )}. Please review the specific documents for complete financial details.`;
    }
  }

  if (
    queryLower.includes("contact") ||
    queryLower.includes("email") ||
    queryLower.includes("phone")
  ) {
    const contactInfo =
      searchResults
        .map((result) => result.text)
        .join(" ")
        .match(
          /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g
        ) || [];

    if (contactInfo.length > 0) {
      return `Contact information found: ${contactInfo.join(
        ", "
      )}. Please check the documents for complete contact details.`;
    }
  }

  // Generic fallback
  const relevantText = searchResults
    .slice(0, 2)
    .map((result) => result.text.substring(0, 200))
    .join("... ");

  return `I found relevant information in the uploaded documents: ${relevantText}... Please review the full documents for complete details.`;
};
