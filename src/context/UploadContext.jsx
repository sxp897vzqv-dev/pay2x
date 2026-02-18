import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

// ═══════════════════════════════════════════════════════════════════
// UPLOAD CONTEXT - Global Background Upload Manager
// ═══════════════════════════════════════════════════════════════════

const UploadContext = createContext(null);

// Upload status enum
export const UploadStatus = {
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

// Generate unique ID
const generateId = () => `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState([]); // Array of upload items
  const [isMinimized, setIsMinimized] = useState(false);
  const abortControllers = useRef({}); // Store abort controllers by upload ID

  // Add file(s) to queue
  const addToQueue = useCallback((files, options = {}) => {
    const {
      bucket = 'uploads',
      folder = '',
      onComplete,
      onError,
      metadata = {},
      maxRetries = 2,
    } = options;

    const fileArray = Array.isArray(files) ? files : [files];
    const newUploads = fileArray.map(file => ({
      id: generateId(),
      file,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      bucket,
      folder,
      status: UploadStatus.QUEUED,
      progress: 0,
      error: null,
      url: null,
      path: null,
      metadata,
      onComplete,
      onError,
      retries: 0,
      maxRetries,
      createdAt: Date.now(),
    }));

    setUploads(prev => [...prev, ...newUploads]);

    // Start processing queue
    newUploads.forEach(upload => {
      processUpload(upload);
    });

    return newUploads.map(u => u.id);
  }, []);

  // Process single upload
  const processUpload = async (uploadItem) => {
    const { id, file, bucket, folder, metadata, onComplete, onError, maxRetries } = uploadItem;
    
    // Create abort controller
    const controller = new AbortController();
    abortControllers.current[id] = controller;

    // Update status to uploading
    updateUpload(id, { status: UploadStatus.UPLOADING, progress: 0 });

    try {
      // Generate unique path
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = folder ? `${folder}/${timestamp}_${safeName}` : `${timestamp}_${safeName}`;

      // Upload to Supabase Storage with progress tracking
      // Note: Supabase JS doesn't support progress natively, we'll simulate it
      // For real progress, use XHR or fetch with ReadableStream
      
      updateUpload(id, { progress: 10 });

      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        });

      if (error) throw error;

      updateUpload(id, { progress: 80, status: UploadStatus.PROCESSING });

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const publicUrl = urlData?.publicUrl;

      // Complete
      updateUpload(id, {
        status: UploadStatus.COMPLETED,
        progress: 100,
        url: publicUrl,
        path: filePath,
      });

      // Callback
      if (onComplete) {
        onComplete({
          id,
          url: publicUrl,
          path: filePath,
          bucket,
          fileName: file.name,
          fileSize: file.size,
          metadata,
        });
      }

    } catch (error) {
      console.error('Upload error:', error);
      
      // Check if cancelled
      if (error.name === 'AbortError') {
        updateUpload(id, { status: UploadStatus.CANCELLED, error: 'Upload cancelled' });
        return;
      }

      // Check retries
      const currentUpload = uploads.find(u => u.id === id);
      if (currentUpload && currentUpload.retries < maxRetries) {
        updateUpload(id, { retries: currentUpload.retries + 1, status: UploadStatus.QUEUED });
        setTimeout(() => processUpload({ ...uploadItem, retries: currentUpload.retries + 1 }), 2000);
        return;
      }

      updateUpload(id, {
        status: UploadStatus.FAILED,
        error: error.message || 'Upload failed',
        progress: 0,
      });

      if (onError) {
        onError({ id, error: error.message, fileName: file.name });
      }
    } finally {
      delete abortControllers.current[id];
    }
  };

  // Update single upload
  const updateUpload = useCallback((id, updates) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  // Cancel upload
  const cancelUpload = useCallback((id) => {
    if (abortControllers.current[id]) {
      abortControllers.current[id].abort();
    }
    updateUpload(id, { status: UploadStatus.CANCELLED, error: 'Cancelled by user' });
  }, [updateUpload]);

  // Retry failed upload
  const retryUpload = useCallback((id) => {
    const upload = uploads.find(u => u.id === id);
    if (upload && upload.status === UploadStatus.FAILED) {
      updateUpload(id, { status: UploadStatus.QUEUED, error: null, retries: 0 });
      processUpload(upload);
    }
  }, [uploads, updateUpload]);

  // Remove from list (completed/failed/cancelled)
  const removeUpload = useCallback((id) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  // Clear all completed
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => 
      u.status !== UploadStatus.COMPLETED && 
      u.status !== UploadStatus.CANCELLED
    ));
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    // Cancel active uploads
    Object.values(abortControllers.current).forEach(controller => controller.abort());
    abortControllers.current = {};
    setUploads([]);
  }, []);

  // Computed values
  const activeUploads = uploads.filter(u => 
    u.status === UploadStatus.QUEUED || 
    u.status === UploadStatus.UPLOADING || 
    u.status === UploadStatus.PROCESSING
  );
  const completedUploads = uploads.filter(u => u.status === UploadStatus.COMPLETED);
  const failedUploads = uploads.filter(u => u.status === UploadStatus.FAILED);
  const hasActiveUploads = activeUploads.length > 0;
  const totalProgress = activeUploads.length > 0
    ? Math.round(activeUploads.reduce((sum, u) => sum + u.progress, 0) / activeUploads.length)
    : 0;

  const value = {
    // State
    uploads,
    activeUploads,
    completedUploads,
    failedUploads,
    hasActiveUploads,
    totalProgress,
    isMinimized,
    
    // Actions
    addToQueue,
    cancelUpload,
    retryUpload,
    removeUpload,
    clearCompleted,
    clearAll,
    setIsMinimized,
  };

  return (
    <UploadContext.Provider value={value}>
      {children}
    </UploadContext.Provider>
  );
}

// Hook to use upload context
export function useUpload() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}

export default UploadContext;
