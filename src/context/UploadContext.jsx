import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase, SUPABASE_URL } from '../supabase';
import * as tus from 'tus-js-client';

// ═══════════════════════════════════════════════════════════════════
// UPLOAD CONTEXT - Global Background Upload Manager with TUS Support
// ═══════════════════════════════════════════════════════════════════

const UploadContext = createContext(null);

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks for TUS

// Upload status enum
export const UploadStatus = {
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
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
  const tusUploads = useRef({}); // Store TUS upload instances by ID
  const callbacks = useRef({}); // Store callbacks by ID

  // Update single upload (memoized)
  const updateUpload = useCallback((id, updates) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
  }, []);

  // TUS upload function
  const uploadWithTus = useCallback(async (uploadItem) => {
    const { id, file, bucket, path, metadata } = uploadItem;

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        updateUpload(id, { status: UploadStatus.FAILED, error: 'Session expired' });
        return;
      }

      updateUpload(id, { status: UploadStatus.UPLOADING, progress: 0 });

      const upload = new tus.Upload(file, {
        endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          'x-upsert': 'true',
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: bucket,
          objectName: path,
          contentType: file.type,
          cacheControl: '3600',
        },
        chunkSize: CHUNK_SIZE,

        onError: (err) => {
          updateUpload(id, { status: UploadStatus.FAILED, error: err.message || 'Upload failed' });
          
          // Call error callback
          if (callbacks.current[id]?.onError) {
            callbacks.current[id].onError({ id, error: err.message, fileName: file.name });
          }
        },

        onProgress: (bytesUploaded, bytesTotal) => {
          const progress = Math.round((bytesUploaded / bytesTotal) * 100);
          updateUpload(id, { progress });
        },

        onSuccess: () => {
          const { data } = supabase.storage.from(bucket).getPublicUrl(path);
          const publicUrl = data.publicUrl;

          updateUpload(id, {
            status: UploadStatus.COMPLETED,
            progress: 100,
            url: publicUrl,
          });

          // Call success callback
          if (callbacks.current[id]?.onComplete) {
            callbacks.current[id].onComplete({
              id,
              url: publicUrl,
              path,
              bucket,
              fileName: file.name,
              fileSize: file.size,
              metadata,
            });
          }

          // Cleanup
          delete tusUploads.current[id];
          delete callbacks.current[id];
        },

        onShouldRetry: (err, retryAttempt) => {
          const status = err.originalResponse?.getStatus?.();
          if (status === 403) return false;
          if (!status || status >= 500) return true;
          return retryAttempt < 3;
        },
      });

      tusUploads.current[id] = upload;

      // Check for previous uploads to resume
      const previousUploads = await upload.findPreviousUploads();
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }

      upload.start();
    } catch (err) {
      updateUpload(id, { status: UploadStatus.FAILED, error: err.message });
    }
  }, [updateUpload]);

  // Add file(s) to queue with TUS support
  const addToQueue = useCallback((files, options = {}) => {
    const {
      bucket = 'uploads',
      folder = '',
      onComplete,
      onError,
      metadata = {},
      useTus = true, // Default to TUS for large files
    } = options;

    const fileArray = Array.isArray(files) ? files : [files];
    const timestamp = Date.now();

    const newUploads = fileArray.map((file, idx) => {
      const id = generateId();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = folder ? `${folder}/${timestamp}_${idx}_${safeName}` : `${timestamp}_${idx}_${safeName}`;

      // Store callbacks
      callbacks.current[id] = { onComplete, onError };

      return {
        id,
        file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        bucket,
        folder,
        path,
        status: UploadStatus.QUEUED,
        progress: 0,
        error: null,
        url: null,
        metadata,
        useTus: useTus && file.size > 1024 * 1024, // Use TUS for files > 1MB
        createdAt: Date.now(),
      };
    });

    setUploads(prev => [...prev, ...newUploads]);

    // Start processing
    newUploads.forEach(upload => {
      if (upload.useTus) {
        uploadWithTus(upload);
      } else {
        processSimpleUpload(upload);
      }
    });

    return newUploads.map(u => u.id);
  }, [uploadWithTus]);

  // Simple upload for small files
  const processSimpleUpload = async (uploadItem) => {
    const { id, file, bucket, path, metadata } = uploadItem;

    updateUpload(id, { status: UploadStatus.UPLOADING, progress: 10 });

    try {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: file.type,
        });

      if (error) throw error;

      updateUpload(id, { progress: 80 });

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;

      updateUpload(id, {
        status: UploadStatus.COMPLETED,
        progress: 100,
        url: publicUrl,
      });

      if (callbacks.current[id]?.onComplete) {
        callbacks.current[id].onComplete({
          id,
          url: publicUrl,
          path,
          bucket,
          fileName: file.name,
          fileSize: file.size,
          metadata,
        });
      }
    } catch (err) {
      updateUpload(id, { status: UploadStatus.FAILED, error: err.message });
      if (callbacks.current[id]?.onError) {
        callbacks.current[id].onError({ id, error: err.message, fileName: file.name });
      }
    } finally {
      delete callbacks.current[id];
    }
  };

  // Pause TUS upload
  const pauseUpload = useCallback((id) => {
    if (tusUploads.current[id]) {
      tusUploads.current[id].abort();
      updateUpload(id, { status: UploadStatus.PAUSED });
    }
  }, [updateUpload]);

  // Resume TUS upload
  const resumeUpload = useCallback((id) => {
    if (tusUploads.current[id]) {
      updateUpload(id, { status: UploadStatus.UPLOADING });
      tusUploads.current[id].start();
    }
  }, [updateUpload]);

  // Cancel upload
  const cancelUpload = useCallback((id) => {
    if (tusUploads.current[id]) {
      tusUploads.current[id].abort();
      delete tusUploads.current[id];
    }
    updateUpload(id, { status: UploadStatus.CANCELLED, error: 'Cancelled by user' });
    delete callbacks.current[id];
  }, [updateUpload]);

  // Retry failed upload
  const retryUpload = useCallback((id) => {
    const upload = uploads.find(u => u.id === id);
    if (upload && upload.status === UploadStatus.FAILED) {
      if (upload.useTus) {
        uploadWithTus(upload);
      } else {
        processSimpleUpload(upload);
      }
    }
  }, [uploads, uploadWithTus]);

  // Remove from list
  const removeUpload = useCallback((id) => {
    if (tusUploads.current[id]) {
      tusUploads.current[id].abort();
      delete tusUploads.current[id];
    }
    delete callbacks.current[id];
    setUploads(prev => prev.filter(u => u.id !== id));
  }, []);

  // Clear all completed/cancelled
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u =>
      u.status !== UploadStatus.COMPLETED &&
      u.status !== UploadStatus.CANCELLED
    ));
  }, []);

  // Clear all
  const clearAll = useCallback(() => {
    Object.keys(tusUploads.current).forEach(id => {
      tusUploads.current[id].abort();
    });
    tusUploads.current = {};
    callbacks.current = {};
    setUploads([]);
  }, []);

  // Computed values
  const activeUploads = uploads.filter(u =>
    u.status === UploadStatus.QUEUED ||
    u.status === UploadStatus.UPLOADING ||
    u.status === UploadStatus.PAUSED
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
    pauseUpload,
    resumeUpload,
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
export function useUploadContext() {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error('useUploadContext must be used within an UploadProvider');
  }
  return context;
}

// Alias for backwards compatibility
export const useUpload = useUploadContext;

export default UploadContext;
