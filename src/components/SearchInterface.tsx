'use client'

import { useState, useEffect } from 'react'
import { Search, Clock, FileText, User, Building, MapPin, DollarSign, TrendingUp, Lightbulb, Trash2, AlertTriangle } from 'lucide-react'

interface SearchResult {
  id: string
  text: string
  metadata: {
    filename: string
    documentType?: string
    date?: string
    identifiers?: string[]
    people?: string[]
    organizations?: string[]
    locations?: string[]
    contacts?: string[]
    financials?: {
      amounts?: number[]
      currency?: string
    }
    keywords?: string[]
    summary?: string
    chunkIndex?: number
    totalChunks?: number
  }
  similarity: number
  scores?: {
    exact: number
    keyword: number
    metadata: number
    question: number
  }
}

interface SearchInterfaceProps {
  onSearchComplete: (history: any[]) => void
}

export default function SearchInterface({ onSearchComplete }: SearchInterfaceProps) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [stats, setStats] = useState<{totalDocuments: number, totalChunks: number, avgChunkSize: number} | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  // Load stats on component mount
  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const response = await fetch('/api/search-suggestions?action=stats')
      const data = await response.json()
      if (data.vector) {
        setStats(data.vector)
      }
    } catch (error) {
      console.error('Failed to load stats:', error)
    }
  }

  const clearAllData = async () => {
    setClearing(true)
    try {
      const response = await fetch('/api/clear-data?confirm=true', {
        method: 'DELETE'
      })
      const result = await response.json()
      
      if (result.success) {
        // Clear local state
        setResults([])
        setStats({ totalDocuments: 0, totalChunks: 0, avgChunkSize: 0 })
        setQuery('')
        setError(null)
        
        // Reload stats to confirm
        await loadStats()
        
        alert('All data cleared successfully!')
      } else {
        alert('Error clearing data: ' + (result.error || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error clearing data:', error)
      alert('Error clearing data: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setClearing(false)
      setShowClearConfirm(false)
    }
  }

  const loadSuggestions = async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setSuggestions([])
      return
    }

    try {
      const response = await fetch(`/api/search-suggestions?action=suggestions&query=${encodeURIComponent(searchQuery)}`)
      const data = await response.json()
      setSuggestions(data.suggestions || [])
    } catch (error) {
      console.error('Failed to load suggestions:', error)
    }
  }

  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return

    setSearching(true)
    setError(null)
    setShowSuggestions(false)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: searchQuery }),
      })

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 200)}`)
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Search failed')
      }

      setResults(data.results || [])
      
      // Update search history
      const historyResponse = await fetch('/api/history')
      const history = await historyResponse.json()
      onSearchComplete(history)
    } catch (err) {
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSearch()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    
    if (value.length >= 2) {
      loadSuggestions(value)
      setShowSuggestions(true)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion)
    setShowSuggestions(false)
    handleSearch(suggestion)
  }

  const formatSimilarity = (similarity: number) => {
    return `${Math.round(similarity * 100)}%`
  }

  const getScoreColor = (score: number) => {
    if (score > 0.7) return 'text-green-600'
    if (score > 0.4) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Search className="w-6 h-6" />
          Enhanced Search
        </h2>
        <div className="flex items-center gap-4">
          {stats && (
            <div className="text-sm text-gray-500 flex items-center gap-4">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                {stats.totalDocuments} docs
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp className="w-4 h-4" />
                {stats.totalChunks} chunks
              </span>
            </div>
          )}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors"
            title="Clear all data"
          >
            <Trash2 className="w-4 h-4" />
            Clear Data
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mb-6 relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => query.length >= 2 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Ask questions like 'What is the total revenue?' or search for keywords..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-500 text-gray-900"
              disabled={searching}
            />
            
            {/* Search Suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                <div className="p-2 text-xs text-gray-500 border-b">
                  <Lightbulb className="w-3 h-3 inline mr-1" />
                  Suggestions
                </div>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {searching ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">
            Search Results ({results.length})
          </h3>
          
          {results.map((result, index) => (
            <div key={result.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-500" />
                  <span className="font-medium text-gray-900">{result.metadata.filename}</span>
                  {result.metadata.documentType && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                      {result.metadata.documentType}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {formatSimilarity(result.similarity)} match
                  </span>
                  {result.scores && (
                    <div className="flex gap-1 text-xs">
                      <span className={`px-1 rounded ${getScoreColor(result.scores.exact)}`}>
                        E:{Math.round(result.scores.exact * 100)}
                      </span>
                      <span className={`px-1 rounded ${getScoreColor(result.scores.keyword)}`}>
                        K:{Math.round(result.scores.keyword * 100)}
                      </span>
                      <span className={`px-1 rounded ${getScoreColor(result.scores.metadata)}`}>
                        M:{Math.round(result.scores.metadata * 100)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-gray-700 mb-3">
                {result.text.substring(0, 300)}
                {result.text.length > 300 && '...'}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                {result.metadata.people && result.metadata.people.length > 0 && (
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      <strong>People:</strong> {result.metadata.people.slice(0, 2).join(', ')}
                      {result.metadata.people.length > 2 && ` +${result.metadata.people.length - 2} more`}
                    </span>
                  </div>
                )}

                {result.metadata.organizations && result.metadata.organizations.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Building className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      <strong>Organizations:</strong> {result.metadata.organizations.slice(0, 2).join(', ')}
                      {result.metadata.organizations.length > 2 && ` +${result.metadata.organizations.length - 2} more`}
                    </span>
                  </div>
                )}

                {result.metadata.locations && result.metadata.locations.length > 0 && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      <strong>Locations:</strong> {result.metadata.locations.slice(0, 2).join(', ')}
                      {result.metadata.locations.length > 2 && ` +${result.metadata.locations.length - 2} more`}
                    </span>
                  </div>
                )}

                {result.metadata.financials?.amounts && result.metadata.financials.amounts.length > 0 && (
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      <strong>Amounts:</strong> {result.metadata.financials.amounts.slice(0, 2).map(amount => 
                        `${amount}${result.metadata.financials?.currency || ''}`
                      ).join(', ')}
                      {result.metadata.financials.amounts.length > 2 && ` +${result.metadata.financials.amounts.length - 2} more`}
                    </span>
                  </div>
                )}

                {result.metadata.date && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-600">
                      <strong>Date:</strong> {result.metadata.date}
                    </span>
                  </div>
                )}

                {result.metadata.identifiers && result.metadata.identifiers.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-gray-600">
                      <strong>IDs:</strong> {result.metadata.identifiers.slice(0, 2).join(', ')}
                      {result.metadata.identifiers.length > 2 && ` +${result.metadata.identifiers.length - 2} more`}
                    </span>
                  </div>
                )}
              </div>

              {result.metadata.summary && (
                <div className="mt-3 p-3 bg-gray-50 rounded-md">
                  <p className="text-sm text-gray-600">
                    <strong>Summary:</strong> {result.metadata.summary}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !searching && query && (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No results found for "{query}"</p>
          <p className="text-sm mt-1">Try different keywords or ask a question</p>
        </div>
      )}

      {/* Clear Data Confirmation Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-semibold text-gray-900">Clear All Data</h3>
            </div>
            <p className="text-gray-600 mb-6">
              This will permanently delete all uploaded documents, search history, and vector data. 
              This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                onClick={clearAllData}
                disabled={clearing}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {clearing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Clear All Data
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
