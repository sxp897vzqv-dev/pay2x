import React from 'react';
import { useUpload, UploadStatus } from '../context/UploadContext';
import {
  Upload, X, CheckCircle, AlertCircle, Loader2, ChevronUp, ChevronDown,
  Trash2, RotateCcw, FileText, Film, Image, File, Minimize2, Maximize2,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// UPLOAD TOAST - Persistent Upload Progress UI
// ═══════════════════════════════════════════════════════════════════

// Get file icon based on type
function getFileIcon(fileType) {
  if (fileType?.startsWith('image/')) return Image;
  if (fileType?.startsWith('video/')) return Film;
  if (fileType?.includes('pdf') || fileType?.includes('document')) return FileText;
  return File;
}

// Format file size
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Single upload item
function UploadItem({ upload, onCancel, onRetry, onRemove }) {
  const FileIcon = getFileIcon(upload.fileType);
  const isActive = [UploadStatus.QUEUED, UploadStatus.UPLOADING, UploadStatus.PROCESSING].includes(upload.status);
  
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
      upload.status === UploadStatus.COMPLETED ? 'bg-green-50' :
      upload.status === UploadStatus.FAILED ? 'bg-red-50' :
      upload.status === UploadStatus.CANCELLED ? 'bg-slate-50' :
      'bg-white'
    }`}>
      {/* File Icon */}
      <div className={`p-2 rounded-lg flex-shrink-0 ${
        upload.status === UploadStatus.COMPLETED ? 'bg-green-100' :
        upload.status === UploadStatus.FAILED ? 'bg-red-100' :
        'bg-blue-100'
      }`}>
        <FileIcon className={`w-4 h-4 ${
          upload.status === UploadStatus.COMPLETED ? 'text-green-600' :
          upload.status === UploadStatus.FAILED ? 'text-red-600' :
          'text-blue-600'
        }`} />
      </div>
      
      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 truncate">{upload.fileName}</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>{formatSize(upload.fileSize)}</span>
          {isActive && (
            <>
              <span>•</span>
              <span className="text-blue-600 font-medium">{upload.progress}%</span>
            </>
          )}
          {upload.status === UploadStatus.COMPLETED && (
            <span className="text-green-600 font-medium">✓ Done</span>
          )}
          {upload.status === UploadStatus.FAILED && (
            <span className="text-red-600 font-medium">{upload.error || 'Failed'}</span>
          )}
          {upload.status === UploadStatus.CANCELLED && (
            <span className="text-slate-500">Cancelled</span>
          )}
        </div>
        
        {/* Progress Bar */}
        {isActive && (
          <div className="mt-1.5 h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 rounded-full ${
                upload.status === UploadStatus.PROCESSING ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'
              }`}
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {isActive && (
          <button 
            onClick={() => onCancel(upload.id)}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {upload.status === UploadStatus.FAILED && (
          <button 
            onClick={() => onRetry(upload.id)}
            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
            title="Retry"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}
        {[UploadStatus.COMPLETED, UploadStatus.FAILED, UploadStatus.CANCELLED].includes(upload.status) && (
          <button 
            onClick={() => onRemove(upload.id)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// Main Toast Component
export default function UploadToast() {
  const {
    uploads,
    activeUploads,
    completedUploads,
    failedUploads,
    hasActiveUploads,
    totalProgress,
    isMinimized,
    setIsMinimized,
    cancelUpload,
    retryUpload,
    removeUpload,
    clearCompleted,
    clearAll,
  } = useUpload();

  // Don't render if no uploads
  if (uploads.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div 
          className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
            hasActiveUploads ? 'bg-blue-600' : completedUploads.length === uploads.length ? 'bg-green-600' : 'bg-slate-700'
          }`}
          onClick={() => setIsMinimized(!isMinimized)}
        >
          <div className="flex items-center gap-3">
            <div className={`p-1.5 rounded-lg ${hasActiveUploads ? 'bg-blue-500' : 'bg-white/20'}`}>
              {hasActiveUploads ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : completedUploads.length === uploads.length ? (
                <CheckCircle className="w-4 h-4 text-white" />
              ) : (
                <Upload className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {hasActiveUploads 
                  ? `Uploading ${activeUploads.length} file${activeUploads.length > 1 ? 's' : ''}...`
                  : completedUploads.length === uploads.length
                    ? `${uploads.length} upload${uploads.length > 1 ? 's' : ''} complete`
                    : `${failedUploads.length} failed`
                }
              </p>
              {hasActiveUploads && (
                <p className="text-xs text-blue-200">{totalProgress}% complete</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Progress Bar (always visible when active) */}
        {hasActiveUploads && (
          <div className="h-1 bg-blue-200">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        )}

        {/* Body (collapsible) */}
        {!isMinimized && (
          <>
            <div className="max-h-72 overflow-y-auto p-2 space-y-2">
              {uploads.map(upload => (
                <UploadItem
                  key={upload.id}
                  upload={upload}
                  onCancel={cancelUpload}
                  onRetry={retryUpload}
                  onRemove={removeUpload}
                />
              ))}
            </div>

            {/* Footer Actions */}
            {(completedUploads.length > 0 || failedUploads.length > 0) && (
              <div className="px-3 py-2 border-t border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {completedUploads.length > 0 && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      {completedUploads.length} done
                    </span>
                  )}
                  {failedUploads.length > 0 && (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                      {failedUploads.length} failed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {completedUploads.length > 0 && (
                    <button 
                      onClick={clearCompleted}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      Clear done
                    </button>
                  )}
                  <button 
                    onClick={clearAll}
                    className="text-xs text-red-500 hover:text-red-700 font-medium"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
