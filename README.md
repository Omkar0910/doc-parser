# AI-Powered Document Parser

A Next.js application that ingests PDF and email documents, extracts rich structured information using AI, and stores embeddings in a Chroma vector database for intelligent search.

## Features

- **Document Upload**: Support for PDF and email (.eml) files
- **AI-Powered Extraction**: Extracts structured information including:
  - Document metadata (type, dates, identifiers)
  - People, organizations, locations
  - Contact information
  - Financial data
  - Keywords and summaries
- **Vector Search**: Semantic search using OpenAI embeddings and ChromaDB
- **Search History**: Track and replay previous searches
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   - Copy `.env.local` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

3. **Database Setup**:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Start Development Server**:
   ```bash
   npm run dev
   ```

5. **Open Application**:
   Navigate to `http://localhost:3000`

## Testing with Sample Documents

The `samples/` directory contains sample documents for testing:

1. **sample-invoice.txt**: An invoice with financial data, contact info, and payment terms
2. **sample-email.txt**: A business email with financial reports and company updates
3. **sample-contract.txt**: A service contract with terms, conditions, and signatures

### How to Test:

1. **Convert Sample Files**: 
   - Convert the `.txt` files to PDF format using any PDF converter
   - For email testing, save the email content as `.eml` format

2. **Upload Documents**:
   - Use the drag-and-drop interface to upload your converted files
   - The system will extract text and generate embeddings

3. **Search Functionality**:
   - Try searches like:
     - "financial data"
     - "contact information"
     - "payment terms"
     - "revenue growth"
     - "contract details"

4. **Search History**:
   - Previous searches will appear in the sidebar
   - Click on history items to re-run searches

## API Endpoints

- `POST /api/upload`: Upload and process documents
- `POST /api/search`: Perform semantic search
- `GET /api/history`: Retrieve search history
- `DELETE /api/history`: Clear search history

## Technology Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **AI/ML**: LangChain, OpenAI GPT-3.5-turbo, OpenAI Embeddings
- **Vector Database**: ChromaDB
- **Database**: SQLite with Prisma ORM
- **Document Parsing**: pdf-parse, mailparser

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend UI   │    │   API Routes    │    │   AI Services   │
│                 │    │                 │    │                 │
│ • Upload Widget │◄──►│ • /api/upload   │◄──►│ • LangChain     │
│ • Search UI     │    │ • /api/search   │    │ • OpenAI GPT    │
│ • History Panel │    │ • /api/history  │    │ • Embeddings    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Data Storage  │
                       │                 │
                       │ • ChromaDB      │
                       │ • SQLite        │
                       │ • Prisma        │
                       └─────────────────┘
```

## Key Features Explained

### Document Processing Pipeline:
1. **Upload**: Files are uploaded via drag-and-drop interface
2. **Parsing**: PDFs and emails are parsed to extract text content
3. **AI Extraction**: GPT-3.5-turbo extracts structured metadata
4. **Chunking**: Text is split into manageable chunks (1000 tokens)
5. **Embedding**: Each chunk is converted to vector embeddings
6. **Storage**: Embeddings and metadata stored in ChromaDB

### Search Process:
1. **Query Processing**: User query is converted to embedding
2. **Similarity Search**: ChromaDB finds most similar document chunks
3. **Result Formatting**: Results include text snippets and extracted metadata
4. **History Tracking**: Search queries are saved for future reference

## Troubleshooting

- **OpenAI API Errors**: Ensure your API key is valid and has sufficient credits
- **ChromaDB Issues**: Check that the `chroma_db` directory is writable
- **Database Errors**: Run `npx prisma db push` to sync schema
- **Upload Failures**: Verify file types are PDF or .eml format

## Future Enhancements

- Support for additional document types (Word, Excel, etc.)
- Advanced filtering options
- Document categorization and tagging
- Export search results
- Batch document processing
- User authentication and document access control