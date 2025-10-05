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
  // Limit to 4000 tokens to avoid token limits
  const prompt = `
Extract structured information from the following document text. Return ONLY valid JSON with the exact structure specified below.

Document filename: ${filename}

Document text:
${text.substring(0, 4000)}

Extract and return JSON with this exact structure:
{
  "filename": "${filename}",
  "documentType": "invoice|email|report|contract|contract_amendment|financial|legal|medical|technical|academic|government|personal|other",
  "date": "YYYY-MM-DD format or null",
  "identifiers": ["array of IDs, numbers, reference codes, PO numbers, tracking numbers, case numbers, account numbers"],
  "people": ["array of person names, job titles, signatories, authors, recipients, witnesses"],
  "organizations": ["array of company names, departments, institutions, agencies, law firms, hospitals"],
  "locations": ["array of addresses, cities, countries, states, regions, facilities"],
  "contacts": ["array of emails, phone numbers, URLs, fax numbers, social media handles"],
  "financials": {
    "amounts": [array of monetary amounts as numbers],
    "currency": "currency code like USD, EUR, etc. or null",
    "revenue": "total revenue amount as number or null",
    "profit": "profit/loss amount as number or null",
    "cash": "cash/cash equivalent amount as number or null",
    "mrr": "Monthly Recurring Revenue as number or null",
    "cac": "Customer Acquisition Cost as number or null",
    "ltv": "Customer Lifetime Value as number or null"
  },
  "contractAmendment": {
    "identifiers": ["array of amendment IDs, contract numbers, reference codes"],
    "effectiveDate": "YYYY-MM-DD format or null",
    "milestoneDates": ["array of milestone dates in YYYY-MM-DD format"],
    "financialChanges": {
      "amount": "financial change amount as number or null",
      "currency": "currency code or null",
      "changeType": "increase|decrease|modification|null"
    },
    "scopeChanges": ["array of scope modifications, additions, deletions"]
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
- For contract amendments: identify amendment-specific information, effective dates, milestone dates, financial changes, and scope modifications
- For financial reports: extract specific financial metrics like revenue, profit, cash, MRR, CAC, LTV
- Document type "contract_amendment" for contract modifications, amendments, addendums
- Document type "financial" for financial reports, statements, budgets, forecasts
- Capture people, organizations, contacts, locations, keywords fully
- Return only JSON, use null for missing values
- Include document type (financial, contract_amendment, email, etc.)
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
        revenue: metadata.financials?.revenue || undefined,
        profit: metadata.financials?.profit || undefined,
        cash: metadata.financials?.cash || undefined,
        mrr: metadata.financials?.mrr || undefined,
        cac: metadata.financials?.cac || undefined,
        ltv: metadata.financials?.ltv || undefined,
      },
      contractAmendment: metadata.contractAmendment
        ? {
            identifiers: metadata.contractAmendment.identifiers || [],
            effectiveDate:
              metadata.contractAmendment.effectiveDate || undefined,
            milestoneDates: metadata.contractAmendment.milestoneDates || [],
            financialChanges: metadata.contractAmendment.financialChanges
              ? {
                  amount:
                    metadata.contractAmendment.financialChanges.amount ||
                    undefined,
                  currency:
                    metadata.contractAmendment.financialChanges.currency ||
                    undefined,
                  changeType:
                    metadata.contractAmendment.financialChanges.changeType ||
                    undefined,
                }
              : undefined,
            scopeChanges: metadata.contractAmendment.scopeChanges || [],
          }
        : undefined,
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
        revenue: undefined,
        profit: undefined,
        cash: undefined,
        mrr: undefined,
        cac: undefined,
        ltv: undefined,
      },
      contractAmendment: undefined,
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
      revenue: undefined,
      profit: undefined,
      cash: undefined,
      mrr: undefined,
      cac: undefined,
      ltv: undefined,
    },
    contractAmendment: undefined,
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
  const textLower = text.toLowerCase();
  if (textLower.includes("invoice")) {
    metadata.documentType = "invoice";
  } else if (
    textLower.includes("amendment") &&
    textLower.includes("contract")
  ) {
    metadata.documentType = "contract_amendment";
  } else if (textLower.includes("contract")) {
    metadata.documentType = "contract";
  } else if (
    textLower.includes("financial") ||
    textLower.includes("revenue") ||
    textLower.includes("profit")
  ) {
    metadata.documentType = "financial";
  } else if (textLower.includes("report")) {
    metadata.documentType = "report";
  } else if (textLower.includes("@") && textLower.includes("subject:")) {
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

  // Select top distinct chunks avoiding repeated content
  const distinctChunks = selectDistinctChunks(filteredResults, 5);

  // Prepare context with enhanced metadata
  const contextChunks = distinctChunks
    .map((result, index) => {
      const metadata = result.metadata || {};
      const source = metadata.filename || `Document ${index + 1}`;
      const docType = metadata.documentType || "unknown";
      const date = metadata.date || "no date";
      const keywords =
        metadata.keywords?.slice(0, 3).join(", ") || "no keywords";
      const similarity = result.similarity || 0;

      return `[Source: ${source} | Type: ${docType} | Date: ${date} | Keywords: ${keywords} | Relevance: ${(
        similarity * 100
      ).toFixed(1)}%]\n${result.text}\n`;
    })
    .join("\n---\n");

  // Truncate context sensibly to maxContextLength
  const truncatedContext = truncateContextSensibly(
    contextChunks,
    maxContextLength
  );

  const sources = distinctChunks.map(
    (result) => result.metadata?.filename || "Unknown document"
  );

  // Enhanced prompt with detailed formatting instructions
  const prompt = `
You are a professional AI assistant that provides detailed, well-formatted answers based on document content. Analyze the provided context thoroughly and generate a comprehensive, formal response.

User Question: ${query}

Context from uploaded documents:
${truncatedContext}

ANALYSIS AND FORMATTING REQUIREMENTS:

1. CONTENT ANALYSIS:
   - Thoroughly analyze the provided context
   - Identify all relevant information related to the question
   - Cross-reference information across multiple sources when available
   - Note any conflicting information or gaps in the data

2. RESPONSE STRUCTURE:
   - Provide a clear, formal introduction that directly addresses the question
   - Organize information logically with proper headings and subheadings
   - Use bullet points, numbered lists, or tables when appropriate
   - Include a conclusion that summarizes key findings

3. DETAILED CONTENT REQUIREMENTS:
   - Provide comprehensive details, not just brief summaries
   - Include specific numbers, dates, names, amounts, and technical details
   - Explain context and background information when relevant
   - Synthesize information from multiple sources into coherent insights
   - Highlight important patterns, trends, or relationships in the data

4. SOURCE ATTRIBUTION:
   - Always cite sources using the format: "According to [Source: filename]..."
   - When synthesizing information from multiple sources, mention all relevant sources
   - Use phrases like "Based on the contract details..." or "The financial report indicates..."
   - Distinguish between different document types (contracts, emails, reports, etc.)

5. FORMATTING GUIDELINES:
   - Use proper business/professional language
   - Structure information hierarchically (main points → sub-points → details)
   - Use formatting like **bold** for emphasis on key terms
   - Include relevant quotes when they add value
   - Present financial data in clear, organized formats
   - Use consistent terminology throughout

6. QUALITY STANDARDS:
   - Provide actionable insights, not just raw data
   - Explain the significance of findings
   - Address potential implications or next steps when relevant
   - Ensure the answer is complete and addresses all aspects of the question
   - Use professional tone appropriate for business/legal documents

7. ERROR HANDLING:
   - If information is incomplete, clearly state what is missing
   - If there are contradictions, present both perspectives with analysis
   - If the question cannot be fully answered, explain what information is available
   - Never fabricate or assume information not present in the context

Generate a detailed, professional response that thoroughly addresses the user's question:`;

  try {
    const llm = await getOpenAIKey();
    const response = await llm.invoke(prompt);
    let answer = response.content as string;

    // Post-process the answer to ensure it's detailed and well-formatted
    answer = postProcessAnswer(answer, query, distinctChunks);

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

    // Fallback to enhanced text-based answer
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

// Enhanced fallback answer generation when AI is not available
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
      return `Based on the documents, I found the following financial information:

**Financial Figures Found:**
${financialInfo.map((amount, index) => `${index + 1}. ${amount}`).join("\n")}

**Source Documents:** ${searchResults
        .map((r) => r.metadata?.filename || "Unknown")
        .join(", ")}

Please review the specific documents for complete financial details and context.`;
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
      return `Based on the documents, I found the following contact information:

**Contact Details Found:**
${contactInfo.map((contact, index) => `${index + 1}. ${contact}`).join("\n")}

**Source Documents:** ${searchResults
        .map((r) => r.metadata?.filename || "Unknown")
        .join(", ")}

Please check the documents for complete contact details and context.`;
    }
  }

  // Enhanced generic fallback with better formatting
  const relevantText = searchResults
    .slice(0, 3)
    .map((result, index) => {
      const source = result.metadata?.filename || `Document ${index + 1}`;
      const text = result.text.substring(0, 300);
      return `**Source: ${source}**\n${text}...`;
    })
    .join("\n\n");

  return `Based on the uploaded documents, I found relevant information related to your query:

${relevantText}

**Summary:** The documents contain information that may be relevant to your question. Please review the full documents for complete details and context.

**Source Documents:** ${searchResults
    .map((r) => r.metadata?.filename || "Unknown")
    .join(", ")}`;
};

// Select distinct chunks avoiding repeated content
function selectDistinctChunks(searchResults: any[], maxChunks: number): any[] {
  const selectedChunks: any[] = [];
  const seenContent = new Set<string>();
  const seenDocuments = new Set<string>();

  for (const result of searchResults) {
    if (selectedChunks.length >= maxChunks) break;

    const filename = result.metadata?.filename || "unknown";
    const text = result.text || "";

    // Create a content signature for deduplication
    const contentSignature = text
      .toLowerCase()
      .substring(0, 200)
      .replace(/\s+/g, " ");

    // Skip if we've seen this content before or if it's from the same document
    if (seenContent.has(contentSignature) || seenDocuments.has(filename)) {
      continue;
    }

    // Add to selected chunks
    selectedChunks.push(result);
    seenContent.add(contentSignature);
    seenDocuments.add(filename);
  }

  return selectedChunks;
}

// Truncate context sensibly to maxContextLength
function truncateContextSensibly(context: string, maxLength: number): string {
  if (context.length <= maxLength) {
    return context;
  }

  // Try to truncate at document boundaries first
  const documentSeparator = "\n---\n";
  const documents = context.split(documentSeparator);

  let truncatedContext = "";
  let currentLength = 0;

  for (const doc of documents) {
    const docWithSeparator = truncatedContext ? documentSeparator + doc : doc;

    if (currentLength + docWithSeparator.length <= maxLength) {
      truncatedContext += docWithSeparator;
      currentLength += docWithSeparator.length;
    } else {
      // Try to include partial document if there's space
      const remainingSpace = maxLength - currentLength;
      if (remainingSpace > 100) {
        // Only if there's meaningful space left
        truncatedContext +=
          documentSeparator +
          doc.substring(0, remainingSpace - documentSeparator.length) +
          "...";
      }
      break;
    }
  }

  return truncatedContext;
}

// Post-process answer to ensure it's detailed and well-formatted
function postProcessAnswer(
  answer: string,
  query: string,
  chunks: any[]
): string {
  // Ensure the answer has proper structure
  if (
    !answer.includes("**") &&
    !answer.includes("##") &&
    !answer.includes("#")
  ) {
    // Add basic formatting if none exists
    const lines = answer.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length > 1) {
      answer = `## Answer\n\n${lines.join("\n\n")}`;
    }
  }

  // Ensure source attribution is present
  const hasSourceAttribution =
    answer.toLowerCase().includes("source:") ||
    answer.toLowerCase().includes("according to") ||
    answer.toLowerCase().includes("based on");

  if (!hasSourceAttribution && chunks.length > 0) {
    const sources = chunks
      .map((chunk) => chunk.metadata?.filename || "Unknown")
      .join(", ");
    answer += `\n\n**Sources:** ${sources}`;
  }

  // Ensure the answer addresses the query directly
  const queryWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
  const answerLower = answer.toLowerCase();
  const queryCoverage =
    queryWords.filter((word) => answerLower.includes(word)).length /
    queryWords.length;

  if (queryCoverage < 0.3) {
    answer = `## Answer\n\n${answer}\n\n*Note: This response may not fully address all aspects of your question. Please review the source documents for additional details.*`;
  }

  return answer;
}
