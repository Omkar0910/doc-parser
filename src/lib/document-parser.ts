import { simpleParser } from "mailparser";

// Dynamic import for pdf-parse to avoid test file issues
const parsePDFBuffer = async (buffer: Buffer): Promise<any> => {
  const pdf = await import("pdf-parse");
  return pdf.default(buffer);
};

export interface DocumentMetadata {
  filename: string;
  documentType?: string;
  date?: string;
  identifiers?: string[];
  people?: string[];
  organizations?: string[];
  locations?: string[];
  contacts?: string[];
  financials?: {
    amounts?: number[];
    currency?: string;
    // Financial report specific fields
    revenue?: number;
    profit?: number;
    cash?: number;
    mrr?: number; // Monthly Recurring Revenue
    cac?: number; // Customer Acquisition Cost
    ltv?: number; // Lifetime Value
  };
  contractAmendment?: {
    identifiers?: string[];
    effectiveDate?: string;
    milestoneDates?: string[];
    financialChanges?: {
      amount?: number;
      currency?: string;
      changeType?: string; // increase, decrease, modification
    };
    scopeChanges?: string[];
  };
  keywords?: string[];
  summary?: string;
}

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: DocumentMetadata;
}

export const parsePDF = async (
  buffer: Buffer,
  filename: string
): Promise<string> => {
  try {
    const data = await parsePDFBuffer(buffer);
    return data.text;
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error(`Failed to parse PDF: ${filename}`);
  }
};

export const parseEmail = async (
  buffer: Buffer,
  filename: string
): Promise<string> => {
  try {
    const parsed = await simpleParser(buffer);
    let content = "";

    if (parsed.text) {
      content += `Subject: ${parsed.subject || "No Subject"}\n`;

      // Handle from field (can be AddressObject or AddressObject[])
      const fromText = Array.isArray(parsed.from)
        ? parsed.from
            .map((addr) => addr.text)
            .filter(Boolean)
            .join(", ")
        : parsed.from?.text || "Unknown";
      content += `From: ${fromText}\n`;

      // Handle to field (can be AddressObject or AddressObject[])
      const toText = Array.isArray(parsed.to)
        ? parsed.to
            .map((addr) => addr.text)
            .filter(Boolean)
            .join(", ")
        : parsed.to?.text || "Unknown";
      content += `To: ${toText}\n`;

      content += `Date: ${parsed.date || "Unknown"}\n\n`;
      content += parsed.text;
    }

    if (parsed.html) {
      // Basic HTML to text conversion
      content += parsed.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    }

    return content;
  } catch (error) {
    console.error("Error parsing email:", error);
    throw new Error(`Failed to parse email: ${filename}`);
  }
};

// Semantic chunking for emails - separates headers, bullet lists, financial highlights, business updates, signature
export const chunkEmailSemantically = (text: string): string[] => {
  const chunks: string[] = [];
  const maxChunkLength = 900; // Target 800-1000 characters

  // Email header patterns
  const headerPatterns = [
    /^From:\s.*$/gm,
    /^To:\s.*$/gm,
    /^Subject:\s.*$/gm,
    /^Date:\s.*$/gm,
    /^CC:\s.*$/gm,
    /^BCC:\s.*$/gm,
    /^Reply-To:\s.*$/gm,
  ];

  // Financial highlight patterns
  const financialPatterns = [
    /\$[\d,]+\.?\d*/g, // Dollar amounts
    /revenue|profit|loss|income|expense|budget|cost|price|fee|payment/i,
    /quarterly|monthly|annual|yearly|fiscal/i,
    /earnings|revenue|sales|income|profit|loss/i,
  ];

  // Business update patterns
  const businessUpdatePatterns = [
    /update|announcement|news|progress|status|milestone/i,
    /launch|release|deployment|implementation/i,
    /meeting|conference|event|deadline/i,
  ];

  // Bullet list patterns
  const bulletPatterns = [
    /^[\s]*[-*•]\s/gm, // Bullet points
    /^[\s]*\d+\.\s/gm, // Numbered lists
    /^[\s]*[a-z]\)\s/gm, // Lettered lists
  ];

  // Signature patterns
  const signaturePatterns = [
    /^Best regards?/i,
    /^Sincerely/i,
    /^Thanks?/i,
    /^Regards?/i,
    /^Cheers/i,
    /^Sent from my/,
    /^This email was sent from/,
  ];

  // Extract headers chunk
  const headers: string[] = [];
  for (const pattern of headerPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      headers.push(...matches);
    }
  }

  if (headers.length > 0) {
    chunks.push(headers.join("\n"));
  }

  // Remove headers from main text for further processing
  let mainText = text;
  for (const pattern of headerPatterns) {
    mainText = mainText.replace(pattern, "");
  }

  // Split text into paragraphs
  const paragraphs = mainText
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);

  let currentChunk = "";
  let currentType = "general";

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (trimmedParagraph.length === 0) continue;

    // Determine paragraph type
    let paragraphType = "general";

    // Check for financial content
    if (
      financialPatterns.some((pattern) =>
        typeof pattern === "string"
          ? trimmedParagraph.toLowerCase().includes(pattern)
          : pattern.test(trimmedParagraph)
      )
    ) {
      paragraphType = "financial";
    }
    // Check for business updates
    else if (
      businessUpdatePatterns.some((pattern) =>
        typeof pattern === "string"
          ? trimmedParagraph.toLowerCase().includes(pattern)
          : pattern.test(trimmedParagraph)
      )
    ) {
      paragraphType = "business";
    }
    // Check for bullet lists
    else if (bulletPatterns.some((pattern) => pattern.test(trimmedParagraph))) {
      paragraphType = "list";
    }
    // Check for signature
    else if (
      signaturePatterns.some((pattern) => pattern.test(trimmedParagraph))
    ) {
      paragraphType = "signature";
    }

    // If type changed and we have content, start new chunk
    if (currentType !== paragraphType && currentChunk.trim().length > 0) {
      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = trimmedParagraph;
      currentType = paragraphType;
    } else {
      // Add to current chunk if it fits
      const testChunk =
        currentChunk + (currentChunk ? "\n\n" : "") + trimmedParagraph;

      if (testChunk.length <= maxChunkLength) {
        currentChunk = testChunk;
      } else {
        // Current chunk is full, start new one
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = trimmedParagraph;
        currentType = paragraphType;
      }
    }
  }

  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.length >= 20); // Remove very short chunks
};

// Semantic chunking for contracts - separates contract details, amendments, financial terms, timeline, provisions
export const chunkContractSemantically = (text: string): string[] => {
  const chunks: string[] = [];
  const maxChunkLength = 900; // Target 800-1000 characters

  // Contract section patterns
  const sectionPatterns = [
    { pattern: /^PARTIES?:?\s*$/gim, type: "parties" },
    { pattern: /^SCOPE\s+OF\s+WORK:?\s*$/gim, type: "scope" },
    { pattern: /^TERMS?\s+AND\s+CONDITIONS?:?\s*$/gim, type: "terms" },
    { pattern: /^PAYMENT\s+TERMS?:?\s*$/gim, type: "payment" },
    { pattern: /^FINANCIAL\s+TERMS?:?\s*$/gim, type: "financial" },
    { pattern: /^AMENDMENT:?\s*$/gim, type: "amendment" },
    { pattern: /^TIMELINE:?\s*$/gim, type: "timeline" },
    { pattern: /^PROVISIONS?:?\s*$/gim, type: "provisions" },
    { pattern: /^TERMINATION:?\s*$/gim, type: "termination" },
    { pattern: /^SIGNATURES?:?\s*$/gim, type: "signatures" },
    { pattern: /^GOVERNING\s+LAW:?\s*$/gim, type: "governing" },
    { pattern: /^FORCE\s+MAJEURE:?\s*$/gim, type: "force_majeure" },
  ];

  // Contract identifiers
  const identifierPatterns = [
    /Contract\s+(Number|#|ID):?\s*[A-Z0-9-]+/gi,
    /Agreement\s+(Number|#|ID):?\s*[A-Z0-9-]+/gi,
    /Reference:?\s*[A-Z0-9-]+/gi,
  ];

  // Financial terms patterns
  const financialPatterns = [
    /\$[\d,]+\.?\d*/g, // Dollar amounts
    /per\s+(month|year|quarter|hour|day)/gi,
    /payment\s+(terms|due|schedule)/gi,
    /late\s+payment\s+fee/gi,
    /interest\s+rate/gi,
  ];

  // Timeline patterns
  const timelinePatterns = [
    /\d{4}-\d{2}-\d{2}/g, // Dates
    /effective\s+date/gi,
    /expiration\s+date/gi,
    /deadline/gi,
    /milestone/gi,
    /delivery\s+date/gi,
  ];

  // Extract contract identifiers first
  const identifiers: string[] = [];
  for (const pattern of identifierPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      identifiers.push(...matches);
    }
  }

  if (identifiers.length > 0) {
    chunks.push(identifiers.join("\n"));
  }

  // Find section boundaries
  const sections: {
    start: number;
    end: number;
    type: string;
    content: string;
  }[] = [];

  for (const sectionPattern of sectionPatterns) {
    const matches = [...text.matchAll(sectionPattern.pattern)];
    for (const match of matches) {
      const start = match.index!;
      const end = text.length; // Will be adjusted when we find the next section

      sections.push({
        start,
        end,
        type: sectionPattern.type,
        content: text.slice(start, end),
      });
    }
  }

  // Sort sections by start position and adjust end positions
  sections.sort((a, b) => a.start - b.start);
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].end = sections[i + 1].start;
    sections[i].content = text.slice(sections[i].start, sections[i].end);
  }

  // Process each section
  for (const section of sections) {
    const content = section.content.trim();
    if (content.length === 0) continue;

    // For financial sections, look for specific financial terms
    if (section.type === "financial" || section.type === "payment") {
      const financialTerms = content.match(financialPatterns.join("|"));
      if (financialTerms) {
        chunks.push(`Financial Terms:\n${content}`);
        continue;
      }
    }

    // For timeline sections, extract dates and milestones
    if (section.type === "timeline") {
      const timelineItems = content.match(timelinePatterns.join("|"));
      if (timelineItems) {
        chunks.push(`Timeline:\n${content}`);
        continue;
      }
    }

    // For amendment sections, extract amendment details
    if (section.type === "amendment") {
      chunks.push(`Amendment Details:\n${content}`);
      continue;
    }

    // For other sections, chunk by content length
    if (content.length <= maxChunkLength) {
      chunks.push(
        `${
          section.type.charAt(0).toUpperCase() + section.type.slice(1)
        }:\n${content}`
      );
    } else {
      // Split large sections by paragraphs
      const paragraphs = content.split(/\n\s*\n/);
      let currentChunk = `${
        section.type.charAt(0).toUpperCase() + section.type.slice(1)
      }:\n`;

      for (const paragraph of paragraphs) {
        const testChunk =
          currentChunk + (currentChunk.includes(":") ? "\n" : "") + paragraph;

        if (testChunk.length <= maxChunkLength) {
          currentChunk = testChunk;
        } else {
          if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = paragraph;
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk.trim());
      }
    }
  }

  // If no sections found, fall back to paragraph-based chunking
  if (chunks.length === 0) {
    const paragraphs = text.split(/\n\s*\n/);
    let currentChunk = "";

    for (const paragraph of paragraphs) {
      const testChunk = currentChunk + (currentChunk ? "\n\n" : "") + paragraph;

      if (testChunk.length <= maxChunkLength) {
        currentChunk = testChunk;
      } else {
        if (currentChunk.trim().length > 0) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = paragraph;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.filter((chunk) => chunk.length >= 20); // Remove very short chunks
};

// Enhanced semantic chunking that detects document type and uses appropriate chunking strategy
export const chunkTextSemantically = (
  text: string,
  filename: string,
  documentType?: string
): string[] => {
  // Detect document type if not provided
  const detectedType = documentType || detectDocumentType(text, filename);

  switch (detectedType) {
    case "email":
      return chunkEmailSemantically(text);
    case "contract":
    case "contract_amendment":
      return chunkContractSemantically(text);
    default:
      // Use enhanced general chunking for other document types
      return chunkTextEnhanced(text);
  }
};

// Enhanced general chunking for non-email/contract documents
export const chunkTextEnhanced = (text: string): string[] => {
  const chunks: string[] = [];
  const maxChunkLength = 900; // Target 800-1000 characters

  // Enhanced section markers for better topic detection
  const sectionMarkers = [
    // Document structure markers
    /^[A-Z\s]+:$/gm, // Section headers like "BUSINESS UPDATES:"
    /^[A-Z][A-Z\s]+$/gm, // All caps headers
    /^\d+\.\s/gm, // Numbered lists
    /^-\s/gm, // Bullet points
    /^\*\s/gm, // Asterisk bullet points
    /^[a-z]\)\s/gm, // Lettered lists like "a) item"
    /^\d+\)\s/gm, // Numbered lists like "1) item"

    // Document-specific markers
    /^Invoice\s#/gim,
    /^Contract\s#/gim,
    /^Report\s#/gim,
    /^Reference:\s/gim,
    /^Account\s#/gim,
    /^Order\s#/gim,

    // Paragraph breaks (double newlines)
    /\n\s*\n/gm,

    // Table-like structures
    /^\s*\|/gm, // Table rows
    /^\s*[-=]+\s*$/gm, // Separator lines
  ];

  // Find potential section boundaries
  const sectionBoundaries: number[] = [0];
  const processedPositions = new Set<number>();

  for (const marker of sectionMarkers) {
    let match;
    marker.lastIndex = 0; // Reset regex state
    while ((match = marker.exec(text)) !== null) {
      const position = match.index;
      if (position > 0 && !processedPositions.has(position)) {
        sectionBoundaries.push(position);
        processedPositions.add(position);
      }
    }
  }

  sectionBoundaries.push(text.length);
  sectionBoundaries.sort((a, b) => a - b);

  // Remove duplicate boundaries that are too close together
  const minSectionSize = 50;
  const filteredBoundaries = [sectionBoundaries[0]];
  for (let i = 1; i < sectionBoundaries.length; i++) {
    if (
      sectionBoundaries[i] -
        filteredBoundaries[filteredBoundaries.length - 1] >=
      minSectionSize
    ) {
      filteredBoundaries.push(sectionBoundaries[i]);
    }
  }

  // Create semantic chunks
  for (let i = 0; i < filteredBoundaries.length - 1; i++) {
    const sectionStart = filteredBoundaries[i];
    const sectionEnd = filteredBoundaries[i + 1];
    const sectionText = text.slice(sectionStart, sectionEnd).trim();

    if (sectionText.length === 0) continue;

    // Clean up the section text
    const cleanedSection = sectionText
      .replace(/\n{3,}/g, "\n\n") // Reduce excessive newlines
      .replace(/\s{2,}/g, " ") // Reduce excessive spaces
      .trim();

    if (cleanedSection.length === 0) continue;

    // If section is small enough, add as single chunk
    if (cleanedSection.length <= maxChunkLength) {
      chunks.push(cleanedSection);
    } else {
      // Split large sections using semantic boundaries
      const subChunks = splitLargeSectionSemantically(
        cleanedSection,
        maxChunkLength
      );
      chunks.push(...subChunks);
    }
  }

  // Fallback to sentence-based chunking if no sections found
  if (chunks.length === 0) {
    chunks.push(...fallbackChunkingSemantically(text, maxChunkLength));
  }

  // Post-process chunks to ensure quality
  return postProcessChunks(chunks, maxChunkLength);
};

// Helper function to detect document type
function detectDocumentType(text: string, filename: string): string {
  const textLower = text.toLowerCase();
  const filenameLower = filename.toLowerCase();

  // Email detection
  if (
    filenameLower.endsWith(".eml") ||
    (textLower.includes("from:") &&
      textLower.includes("to:") &&
      textLower.includes("subject:"))
  ) {
    return "email";
  }

  // Contract detection
  if (textLower.includes("contract") || textLower.includes("agreement")) {
    if (textLower.includes("amendment") || textLower.includes("addendum")) {
      return "contract_amendment";
    }
    return "contract";
  }

  // Invoice detection
  if (textLower.includes("invoice") || filenameLower.includes("invoice")) {
    return "invoice";
  }

  // Financial report detection
  if (
    textLower.includes("financial") ||
    textLower.includes("revenue") ||
    textLower.includes("profit")
  ) {
    return "financial";
  }

  return "other";
}

// Enhanced helper function to split large sections semantically
function splitLargeSectionSemantically(
  sectionText: string,
  maxChunkLength: number
): string[] {
  const chunks: string[] = [];
  const sentences = sectionText.split(/(?<=[.!?])\s+/);

  let currentChunk = "";
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence would exceed chunk size, start a new chunk
    if (
      currentLength + sentenceLength > maxChunkLength &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentLength = sentenceLength;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
      currentLength += sentenceLength;
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Enhanced fallback chunking for documents without clear sections
function fallbackChunkingSemantically(
  text: string,
  maxChunkLength: number
): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);

  let currentChunk = "";
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence would exceed chunk size, start a new chunk
    if (
      currentLength + sentenceLength > maxChunkLength &&
      currentChunk.length > 0
    ) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
      currentLength = sentenceLength;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
      currentLength += sentenceLength;
    }
  }

  // Add the last chunk if it has content
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

// Legacy chunking function for backward compatibility
export const chunkText = (
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] => {
  // Use the new semantic chunking as default
  return chunkTextSemantically(text, "unknown", "other");
};

// Post-process chunks to ensure quality and remove duplicates
function postProcessChunks(chunks: string[], chunkSize: number): string[] {
  const processedChunks: string[] = [];
  const seenChunks = new Set<string>();

  for (const chunk of chunks) {
    // Skip empty or very short chunks
    if (chunk.length < 20) continue;

    // Skip chunks that are too similar to already processed chunks
    const chunkLower = chunk.toLowerCase().trim();
    if (seenChunks.has(chunkLower)) continue;

    // Skip chunks that are mostly whitespace or special characters
    const meaningfulChars = chunk.replace(/[\s\n\r\t]/g, "").length;
    if (meaningfulChars < chunk.length * 0.3) continue;

    processedChunks.push(chunk);
    seenChunks.add(chunkLower);
  }

  return processedChunks;
}
