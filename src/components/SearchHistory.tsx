'use client'

import { useState, useEffect } from 'react'
import { History, Trash2, Search, Clock } from 'lucide-react'

interface SearchHistoryItem {
  id: string
  query: string
  timestamp: string
  results: number
}

interface SearchHistoryProps {
  history: SearchHistoryItem[]
  onHistoryUpdate: (history: SearchHistoryItem[]) => void
}

export default function SearchHistory({ history, onHistoryUpdate }: SearchHistoryProps) {
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchHistory()
  }, [])

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/history')
      const data = await response.json()
      onHistoryUpdate(data)
    } catch (error) {
      console.error('Failed to fetch search history:', error)
    }
  }

  const clearHistory = async () => {
    setLoading(true)
    try {
      await fetch('/api/history', { method: 'DELETE' })
      onHistoryUpdate([])
    } catch (error) {
      console.error('Failed to clear history:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleHistoryClick = async (query: string) => {
    // Trigger search with the historical query
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
    if (searchInput) {
      searchInput.value = query
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      
      // Trigger search
      const searchButton = document.querySelector('button[type="submit"]') as HTMLButtonElement
      if (searchButton) {
        searchButton.click()
      }
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60))
    
    if (diffInHours < 1) {
      return 'Just now'
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`
    } else {
      return date.toLocaleDateString()
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5" />
          Search History
        </h2>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            disabled={loading}
            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No search history yet</p>
          <p className="text-sm">Your searches will appear here</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {history.map((item) => (
            <div
              key={item.id}
              className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
              onClick={() => handleHistoryClick(item.query)}
            >
              <div className="flex items-start justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                  {item.query}
                </p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(item.timestamp)}
                </div>
              </div>
              <p className="text-xs text-gray-500">
                {item.results} result{item.results !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
