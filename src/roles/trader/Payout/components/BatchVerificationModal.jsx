import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Video, FileText, CheckCircle, AlertCircle, Loader2, Wifi } from 'lucide-react';
import { supabase } from '../../../../supabase';
import { useUploadContext, UploadStatus } from '../../../../context/UploadContext';

/**
 * Batch verification modal - Uses global upload context for background uploads
 * User can close modal and uploads will continue in background
 */
export default function BatchVerificationModal({ request, completedPayouts, onClose, onSubmit }) {
  const { addToQueue, uploads, activeUploads } = useUploadContext();
  
  const [statementFile, setStatementFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadIds, setUploadIds] = useState({ statement: null, video: null });

  const statementInputRef = useRef();
  const videoInputRef = useRef();

  const totalAmount = completedPayouts.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Track upload completion
  const statementUpload = uploadIds.statement ? uploads.find(u => u.id === uploadIds.statement) : null;
  const videoUpload = uploadIds.video ? uploads.find(u => u.id === uploadIds.video) : null;
  
  const statementCompleted = statementUpload?.status === UploadStatus.COMPLETED;
  const videoCompleted = videoUpload?.status === UploadStatus.COMPLETED;
  const anyFailed = statementUpload?.status === UploadStatus.FAILED || videoUpload?.status === UploadStatus.FAILED;
  const anyUploading = statementUpload?.status === UploadStatus.UPLOADING || videoUpload?.status === UploadStatus.UPLOADING;

  // When both uploads complete, finalize
  useEffect(() => {
    if (statementCompleted && videoCompleted && submitting) {
      finalizeVerification(statementUpload.url, videoUpload.url);
    }
  }, [statementCompleted, videoCompleted, submitting]);

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
    
    if (file.size > 10 * 1024 * 1024) {
      setError('Statement file must be under 10MB');
      return;
    }
    
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Statement must be an image or PDF');
      return;
    }
    
    setStatementFile(file);
    setUploadIds(prev => ({ ...prev, statement: null }));
    setError('');
  };

  const handleVideoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 50 * 1024 * 1024) {
      setError('Video must be under 50MB');
      return;
    }
    
    const result = await validateVideo(file);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    
    setVideoFile(file);
    setUploadIds(prev => ({ ...prev, video: null }));
    setError('');
  };

  const clearStatement = () => {
    setStatementFile(null);
    setUploadIds(prev => ({ ...prev, statement: null }));
  };

  const clearVideo = () => {
    setVideoFile(null);
    setUploadIds(prev => ({ ...prev, video: null }));
  };

  const finalizeVerification = async (statementUrl, videoUrl) => {
    try {
      // Update payout request with verification
      // IMPORTANT: Cancel waiting list when submitting verification
      // Trader is done with this request cycle, don't assign more payouts
      const { error: updateError } = await supabase
        .from('payout_requests')
        .update({
          verification_status: 'pending_review',
          statement_proof_url: statementUrl,
          video_proof_url: videoUrl,
          verification_submitted_at: new Date().toISOString(),
          status: 'pending_verification',
          // Cancel waiting list - trader is done with this request
          in_waiting_list: false,
          remaining_amount: 0,
        })
        .eq('id', request.id);

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
      console.error('Finalize error:', err);
      setError(err.message || 'Failed to submit verification');
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (!statementFile || !videoFile) {
      setError('Both statement and video are required');
      return;
    }

    setSubmitting(true);
    setError('');

    const timestamp = Date.now();
    const requestId = request.id;

    // Add files to global upload queue
    const statementExt = statementFile.name.split('.').pop();
    const videoExt = videoFile.name.split('.').pop();

    const [statementId] = addToQueue(statementFile, {
      bucket: 'payout-proofs',
      folder: `batch-verification/${requestId}`,
      metadata: { type: 'statement', requestId },
    });

    const [videoId] = addToQueue(videoFile, {
      bucket: 'payout-proofs',
      folder: `batch-verification/${requestId}`,
      metadata: { type: 'video', requestId },
    });

    setUploadIds({ statement: statementId, video: videoId });
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canClose = !submitting || (statementUpload && videoUpload); // Can close if not submitting or uploads started

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={canClose ? onClose : undefined} />
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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Uploading notice - shown when uploads in progress */}
        {anyUploading && (
          <div className="mx-4 mt-3 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
            <Loader2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5 animate-spin" />
            <div>
              <p className="text-xs font-semibold text-blue-800">Uploading in background...</p>
              <p className="text-xs text-blue-600">You can close this modal. Check progress in bottom-right corner.</p>
            </div>
          </div>
        )}

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
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Background upload notice */}
          {(statementFile || videoFile) && !submitting && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-start gap-2">
              <Wifi className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-green-700">
                <span className="font-semibold">Background upload.</span> You can close this modal after clicking submit.
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
              disabled={submitting}
            />
            {statementFile ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-slate-50">
                  <FileText className="w-8 h-8 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{statementFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(statementFile.size)}</p>
                  </div>
                  {statementCompleted && <CheckCircle className="w-5 h-5 text-green-500" />}
                </div>
                {statementUpload && statementUpload.status === UploadStatus.UPLOADING && (
                  <div className="px-3 py-2 bg-purple-50 border-t border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-700 font-medium">Uploading...</span>
                      <span className="text-xs font-bold text-purple-700">{statementUpload.progress}%</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-1.5">
                      <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${statementUpload.progress}%` }} />
                    </div>
                  </div>
                )}
                {!submitting && (
                  <div className="px-3 py-2 border-t border-slate-200 flex justify-end bg-white">
                    <button onClick={clearStatement} className="text-xs text-red-500 font-semibold hover:text-red-700">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => statementInputRef.current?.click()} disabled={submitting}
                className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-purple-400 hover:bg-purple-50 transition-all disabled:opacity-50">
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
              disabled={submitting}
            />
            {videoFile ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-slate-50">
                  <Video className="w-8 h-8 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{videoFile.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(videoFile.size)}</p>
                  </div>
                  {videoCompleted && <CheckCircle className="w-5 h-5 text-green-500" />}
                </div>
                {videoUpload && videoUpload.status === UploadStatus.UPLOADING && (
                  <div className="px-3 py-2 bg-purple-50 border-t border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-purple-700 font-medium">Uploading...</span>
                      <span className="text-xs font-bold text-purple-700">{videoUpload.progress}%</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-1.5">
                      <div className="h-full bg-purple-600 rounded-full transition-all" style={{ width: `${videoUpload.progress}%` }} />
                    </div>
                  </div>
                )}
                {!submitting && (
                  <div className="px-3 py-2 border-t border-slate-200 flex justify-end bg-white">
                    <button onClick={clearVideo} className="text-xs text-red-500 font-semibold hover:text-red-700">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => videoInputRef.current?.click()} disabled={submitting}
                className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl text-center hover:border-purple-400 hover:bg-purple-50 transition-all disabled:opacity-50">
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
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">
            {anyUploading ? 'Close (uploads continue)' : 'Cancel'}
          </button>
          <button onClick={handleSubmit} disabled={!statementFile || !videoFile || submitting}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97] flex items-center justify-center gap-2">
            {submitting ? (
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
