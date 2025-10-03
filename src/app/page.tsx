'use client'

import { useState } from 'react'
import DocumentUpload from '@/components/DocumentUpload'
import SearchInterface from '@/components/SearchInterface'
import SearchHistory from '@/components/SearchHistory'

export default function Home() {
  const [searchHistory, setSearchHistory] = useState<any[]>([])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            AI-Powered Document Parser
          </h1>
          <p className="text-gray-600">
            Upload PDFs and emails, extract structured information, and search with AI
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-8">
            <DocumentUpload />
            <SearchInterface onSearchComplete={setSearchHistory} />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <SearchHistory 
              history={searchHistory} 
              onHistoryUpdate={setSearchHistory}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
