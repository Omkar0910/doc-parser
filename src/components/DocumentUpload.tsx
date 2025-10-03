'use client'

import { useState, useCallback } from 'react'
import { Upload, FileText, Mail, CheckCircle, AlertCircle } from 'lucide-react'

interface UploadResult {
  success: boolean
  filename: string
  chunks: number
  metadata: any
}

export default function DocumentUpload() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileUpload = useCallback(async (file: File) => {
    if (!file) return

    // Validate file type
    const validTypes = ['application/pdf', 'message/rfc822']
    const validExtensions = ['.pdf', '.eml']
    const isValidType = validTypes.includes(file.type) || 
                       validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))

    if (!isValidType) {
      setError('Please upload a PDF or email (.eml) file')
      return
    }

    setUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      // Check if response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Server returned non-JSON response: ${text.substring(0, 200)}`)
      }

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setResult(data)
    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileUpload(files[0])
    }
  }, [handleFileUpload])

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Upload className="w-6 h-6" />
        Upload Documents
      </h2>

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="flex gap-4">
            <FileText className="w-12 h-12 text-gray-400" />
            <Mail className="w-12 h-12 text-gray-400" />
          </div>
          
          <div>
            <p className="text-lg font-medium text-gray-900 mb-2">
              Drop your files here or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Supports PDF and email (.eml) files
            </p>
          </div>

          <input
            type="file"
            accept=".pdf,.eml"
            onChange={handleFileInput}
            className="hidden"
            id="file-upload"
            disabled={uploading}
          />
          
          <label
            htmlFor="file-upload"
            className={`px-6 py-2 rounded-md font-medium transition-colors ${
              uploading
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {uploading ? 'Uploading...' : 'Choose File'}
          </label>
        </div>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-700">{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="font-medium text-green-700">Upload Successful!</span>
          </div>
          <div className="text-sm text-green-600 space-y-1">
            <p><strong>File:</strong> {result.filename}</p>
            <p><strong>Chunks:</strong> {result.chunks}</p>
            <p><strong>Type:</strong> {result.metadata.documentType}</p>
            {result.metadata.summary && (
              <p><strong>Summary:</strong> {result.metadata.summary}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
