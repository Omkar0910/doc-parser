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

export const chunkText = (
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] => {
  const chunks: string[] = [];
  const maxChunks = 1000; // Prevent infinite loops

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

    // Email-specific markers
    /^From:\s/gm,
    /^To:\s/gm,
    /^Subject:\s/gm,
    /^Date:\s/gm,
    /^CC:\s/gm,
    /^BCC:\s/gm,

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

  // Find potential section boundaries with improved logic
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
  const minSectionSize = 50; // Minimum section size
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

  // Create topic-aware chunks
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

    // If section is small enough, add as single topic chunk
    if (cleanedSection.length <= chunkSize) {
      chunks.push(cleanedSection);
    } else {
      // Split large sections using semantic boundaries
      const subChunks = splitLargeSection(cleanedSection, chunkSize, overlap);
      chunks.push(...subChunks);
    }
  }

  // Fallback to sentence-based chunking if no sections found
  if (chunks.length === 0) {
    chunks.push(...fallbackChunking(text, chunkSize, overlap, maxChunks));
  }

  // Post-process chunks to ensure quality
  return postProcessChunks(chunks, chunkSize);
};

// Helper function to split large sections semantically
function splitLargeSection(
  sectionText: string,
  chunkSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  const sentences = sectionText.split(/(?<=[.!?])\s+/);

  let currentChunk = "";
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceLength = sentence.length;

    // If adding this sentence would exceed chunk size, start a new chunk
    if (currentLength + sentenceLength > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap from previous chunk
      const overlapText = currentChunk.slice(-overlap);
      currentChunk = overlapText + " " + sentence;
      currentLength = currentChunk.length;
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

// Fallback chunking for documents without clear sections
function fallbackChunking(
  text: string,
  chunkSize: number,
  overlap: number,
  maxChunks: number
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    // Try to break at sentence boundaries
    if (end < text.length) {
      const lastSentenceEnd = chunk.lastIndexOf(".");
      const lastNewline = chunk.lastIndexOf("\n");
      const lastParagraph = chunk.lastIndexOf("\n\n");
      const breakPoint = Math.max(lastSentenceEnd, lastNewline, lastParagraph);

      if (breakPoint > start + chunkSize * 0.5) {
        chunk = text.slice(start, start + breakPoint + 1);
      }
    }

    const trimmedChunk = chunk.trim();
    if (trimmedChunk.length > 0) {
      chunks.push(trimmedChunk);
    }

    // Move to next chunk with overlap
    const nextStart = start + Math.max(chunk.length - overlap, 1);
    if (nextStart <= start) {
      start += chunkSize; // Fallback: move by chunk size
    } else {
      start = nextStart;
    }

    if (start >= text.length) break;
  }

  return chunks;
}

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
