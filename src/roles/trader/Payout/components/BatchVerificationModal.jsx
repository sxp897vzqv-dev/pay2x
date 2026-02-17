import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Video, FileText, CheckCircle, AlertCircle, Loader2, Wifi, WifiOff, Pause, Play } from 'lucide-react';
import { supabase, SUPABASE_URL } from '../../../../supabase';
import * as tus from 'tus-js-client';

const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks

/**
 * Batch verification modal - ONE video + ONE statement for all completed payouts in a request
 * Now with TUS resumable uploads for stability on slow/unstable connections
 */
export default function BatchVerificationModal({ request, completedPayouts, onClose, onSubmit }) {
  const [statementFile, setStatementFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ statement: 0, video: 0 });
  const [uploadStatus, setUploadStatus] = useState({ statement: 'pending', video: 'pending' });

  const statementInputRef = useRef();
  const videoInputRef = useRef();
  const tusUploadsRef = useRef({ statement: null, video: null });
  const uploadedUrlsRef = useRef({ statement: null, video: null });

  const totalAmount = completedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Validate video duration
  const validateVideo = (file) => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        const duration = video.duration;
        if (duration < 5) resolve({ valid: false, error: 'Video must be at least 5 seconds' });
        else if (duration > 60) resolve({ valid: false, error: 'Video must be under 60 seconds' });
        else resolve({ valid: true, duration });
      };
      video.onerror = () => resolve({ valid: false, error: 'Invalid video file' });
      video.src = URL.createObjectURL(file);
    });
  };

  const handleStatementChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      setError('Statement file must be under 10MB');
      return;
    }
    
    // Only images and PDFs
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Statement must be an image or PDF');
      return;
    }
    
    setStatementFile(file);
    setUploadStatus(s => ({ ...s, statement: 'pending' }));
    setUploadProgress(p => ({ ...p, statement: 0 }));
    uploadedUrlsRef.current.statement = null;
    setError('');
  };

  const handleVideoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Max 50MB
    if (file.size > 50 * 1024 * 1024) {
      setError('Video must be under 50MB');
      return;
    }
    
    // Validate duration
    const result = await validateVideo(file);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    
    setVideoFile(file);
    setUploadStatus(s => ({ ...s, video: 'pending' }));
    setUploadProgress(p => ({ ...p, video: 0 }));
    uploadedUrlsRef.current.video = null;
    setError('');
  };

  // Clear files
  const clearStatement = () => {
    if (tusUploadsRef.current.statement) {
      tusUploadsRef.current.statement.abort();
      tusUploadsRef.current.statement = null;
    }
    setStatementFile(null);
    setUploadStatus(s => ({ ...s, statement: 'pending' }));
    setUploadProgress(p => ({ ...p, statement: 0 }));
    uploadedUrlsRef.current.statement = null;
  };

  const clearVideo = () => {
    if (tusUploadsRef.current.video) {
      tusUploadsRef.current.video.abort();
      tusUploadsRef.current.video = null;
    }
    setVideoFile(null);
    setUploadStatus(s => ({ ...s, video: 'pending' }));
    setUploadProgress(p => ({ ...p, video: 0 }));
    uploadedUrlsRef.current.video = null;
  };

  // TUS Resumable Upload
  const uploadWithTus = useCallback(async (file, bucket, path, type) => {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
          reject(new Error('Session expired. Please refresh and try again.'));
          return;
        }

        setUploadStatus(s => ({ ...s, [type]: 'uploading' }));

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
            console.error(`TUS upload error (${type}):`, err);
            setUploadStatus(s => ({ ...s, [type]: 'error' }));
            
            if (err.originalRequest) {
              setError('Upload interrupted. Tap "Retry" to continue.');
            } else {
              reject(err);
            }
          },
          
          onProgress: (bytesUploaded, bytesTotal) => {
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            setUploadProgress(p => ({ ...p, [type]: percentage }));
          },
          
          onSuccess: () => {
            setUploadStatus(s => ({ ...s, [type]: 'complete' }));
            setUploadProgress(p => ({ ...p, [type]: 100 }));
            
            const { data } = supabase.storage.from(bucket).getPublicUrl(path);
            uploadedUrlsRef.current[type] = data.publicUrl;
            resolve(data.publicUrl);
          },

          onShouldRetry: (err, retryAttempt, options) => {
            const status = err.originalResponse?.getStatus?.();
            if (status === 403) return false;
            if (!status || status >= 500) return true;
            return false;
          },
        });

        tusUploadsRef.current[type] = upload;

        const previousUploads = await upload.findPreviousUploads();
        if (previousUploads.length > 0) {
          console.log(`Resuming previous upload for ${type}`);
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        upload.start();
      } catch (err) {
        reject(err);
      }
    });
  }, []);

  // Pause/Resume
  const pauseUpload = (type) => {
    if (tusUploadsRef.current[type]) {
      tusUploadsRef.current[type].abort();
      setUploadStatus(s => ({ ...s, [type]: 'paused' }));
    }
  };

  const resumeUpload = (type) => {
    if (tusUploadsRef.current[type]) {
      setUploadStatus(s => ({ ...s, [type]: 'uploading' }));
      tusUploadsRef.current[type].start();
    }
  };

  const handleSubmit = async () => {
    if (!statementFile || !videoFile) {
      setError('Both statement and video are required');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const timestamp = Date.now();
      const requestId = request.id;

      const statementExt = statementFile.name.split('.').pop();
      const statementPath = `batch-verification/${requestId}/statement_${timestamp}.${statementExt}`;
      
      const videoExt = videoFile.name.split('.').pop();
      const videoPath = `batch-verification/${requestId}/video_${timestamp}.${videoExt}`;

      // Upload both in parallel with TUS
      const [statementUrl, videoUrl] = await Promise.all([
        uploadedUrlsRef.current.statement || uploadWithTus(statementFile, 'payout-proofs', statementPath, 'statement'),
        uploadedUrlsRef.current.video || uploadWithTus(videoFile, 'payout-proofs', videoPath, 'video'),
      ]);

      // Update payout request with verification
      const { error: updateError } = await supabase
        .from('payout_requests')
        .update({
          verification_status: 'pending_review',
          statement_proof_url: statementUrl,
          video_proof_url: videoUrl,
          verification_submitted_at: new Date().toISOString(),
          status: 'pending_verification',
        })
        .eq('id', requestId);

      if (updateError) throw new Error('Failed to update request: ' + updateError.message);

      // Update all completed payouts to pending_verification
      const payoutIds = completedPayouts.map(p => p.id);
      await supabase
        .from('payouts')
        .update({ verification_status: 'pending_review' })
        .in('id', payoutIds);

      onSubmit({ 
        success: true, 
        payoutCount: completedPayouts.length,
        totalAmount 
      });
    } catch (err) {
      console.error('Verification upload error:', err);
      setError(err.message || 'Upload failed. Tap retry to continue.');
    }
    
    setUploading(false);
  };

  const totalProgress = (uploadProgress.statement + uploadProgress.video) / 2;
  const canResume = uploadStatus.statement === 'paused' || uploadStatus.statement === 'error' ||
                    uploadStatus.video === 'paused' || uploadStatus.video === 'error';

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={uploading ? undefined : onClose} />
      <div className="relative w-full sm:w-full sm:max-w-lg bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-purple-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Submit Verification</h3>
              <p className="text-xs text-slate-500">For all {completedPayouts.length} completed payouts</p>
            </div>
          </div>
          <button onClick={onClose} disabled={uploading} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* summary */}
        <div className="px-4 pt-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-green-700">Completed Payouts</span>
              <span className="text-xs font-bold text-green-800 bg-green-100 px-2 py-0.5 rounded-full">
                {completedPayouts.length} payouts
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-green-600">Total Amount</span>
              <span className="text-xl font-bold text-green-700">₹{totalAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-red-700">{error}</p>
                {canResume && (
                  <button onClick={handleSubmit} className="mt-1 text-xs font-semibold text-red-600 underline">
                    Tap to retry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Resumable notice */}
          {(statementFile || videoFile) && !uploading && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
              <Wifi className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-700">
                <span className="font-semibold">Resumable upload.</span> If connection drops, progress is saved.
              </p>
            </div>
          )}

          {/* Statement upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Bank Statement *
            </label>
            <input
              ref={statementInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleStatementChange}
              className="hidden"
            />
            {statementFile ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-slate-50">
                  <FileText className="w-8 h-8 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{statementFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(statementFile.size)}</p>
                  </div>
                </div>
                
                {/* Progress */}
                {(uploadStatus.statement === 'uploading' || uploadStatus.statement === 'paused') && (
                  <div className="px-3 py-2 bg-purple-50 border-t border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-700 font-medium">
                        {uploadStatus.statement === 'paused' ? 'Paused' : 'Uploading...'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-700">{uploadProgress.statement}%</span>
                        <button onClick={() => uploadStatus.statement === 'paused' ? resumeUpload('statement') : pauseUpload('statement')}
                          className="p-1 hover:bg-purple-100 rounded">
                          {uploadStatus.statement === 'paused' ? <Play className="w-3.5 h-3.5 text-purple-600" /> : <Pause className="w-3.5 h-3.5 text-purple-600" />}
                        </button>
                      </div>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-1.5">
                      <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${uploadProgress.statement}%` }} />
                    </div>
                  </div>
                )}
                
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${
                    uploadStatus.statement === 'complete' ? 'text-green-600' :
                    uploadStatus.statement === 'error' ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {uploadStatus.statement === 'complete' && <><CheckCircle className="w-3.5 h-3.5" /> Uploaded</>}
                    {uploadStatus.statement === 'error' && <><WifiOff className="w-3.5 h-3.5" /> Failed</>}
                    {uploadStatus.statement === 'pending' && <>Ready</>}
                  </span>
                  <button onClick={clearStatement} disabled={uploading && uploadStatus.statement === 'uploading'}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => statementInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-purple-400 hover:bg-purple-50 transition-all">
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-slate-600">Upload Statement</p>
                <p className="text-xs text-slate-400">Image or PDF, max 10MB</p>
              </button>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
              <Video className="w-3.5 h-3.5 inline mr-1" />
              Video Proof *
            </label>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
              className="hidden"
            />
            {videoFile ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-slate-50">
                  <Video className="w-8 h-8 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{videoFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(videoFile.size)}</p>
                  </div>
                </div>
                
                {/* Progress */}
                {(uploadStatus.video === 'uploading' || uploadStatus.video === 'paused') && (
                  <div className="px-3 py-2 bg-purple-50 border-t border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-700 font-medium">
                        {uploadStatus.video === 'paused' ? 'Paused' : 'Uploading...'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-purple-700">{uploadProgress.video}%</span>
                        <button onClick={() => uploadStatus.video === 'paused' ? resumeUpload('video') : pauseUpload('video')}
                          className="p-1 hover:bg-purple-100 rounded">
                          {uploadStatus.video === 'paused' ? <Play className="w-3.5 h-3.5 text-purple-600" /> : <Pause className="w-3.5 h-3.5 text-purple-600" />}
                        </button>
                      </div>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-1.5">
                      <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${uploadProgress.video}%` }} />
                    </div>
                  </div>
                )}
                
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${
                    uploadStatus.video === 'complete' ? 'text-green-600' :
                    uploadStatus.video === 'error' ? 'text-red-600' : 'text-slate-500'
                  }`}>
                    {uploadStatus.video === 'complete' && <><CheckCircle className="w-3.5 h-3.5" /> Uploaded</>}
                    {uploadStatus.video === 'error' && <><WifiOff className="w-3.5 h-3.5" /> Failed</>}
                    {uploadStatus.video === 'pending' && <>Ready</>}
                  </span>
                  <button onClick={clearVideo} disabled={uploading && uploadStatus.video === 'uploading'}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => videoInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-purple-400 hover:bg-purple-50 transition-all">
                <Video className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p className="text-sm font-semibold text-slate-600">Upload Video</p>
                <p className="text-xs text-slate-400">5-60 seconds, max 50MB</p>
              </button>
            )}
          </div>

          {/* Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-800 mb-1">Video Requirements:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
              <li>Show your bank app with today's transactions</li>
              <li>Scroll through all completed payouts</li>
              <li>Each UTR should be visible</li>
              <li>Duration: 5-60 seconds</li>
            </ul>
          </div>

          {/* Combined progress bar */}
          {uploading && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-purple-800">Uploading proofs…</p>
                <p className="text-xs font-bold text-purple-800">{Math.round(totalProgress)}%</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600 w-16">Statement</span>
                  <div className="flex-1 bg-purple-200 rounded-full h-1.5">
                    <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${uploadProgress.statement}%` }} />
                  </div>
                  <span className="text-xs text-purple-600 w-8">{uploadProgress.statement}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600 w-16">Video</span>
                  <div className="flex-1 bg-purple-200 rounded-full h-1.5">
                    <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${uploadProgress.video}%` }} />
                  </div>
                  <span className="text-xs text-purple-600 w-8">{uploadProgress.video}%</span>
                </div>
              </div>
              <p className="text-xs text-purple-600 text-center">Upload will resume if interrupted.</p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!statementFile || !videoFile || uploading}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97] flex items-center justify-center gap-2">
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
            ) : (
              <><Upload className="w-4 h-4" /> Submit for Review</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
