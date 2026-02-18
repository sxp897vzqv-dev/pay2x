import React, { useState, useRef, useCallback, useEffect } from 'react';
import { supabase, SUPABASE_URL } from '../../../../supabase';
import { useUpload, UploadStatus } from '../../../../hooks/useUpload';
import * as tus from 'tus-js-client';
import {
  X, RefreshCw, CheckCircle, Upload, FileText, Video, AlertCircle,
  Image as ImageIcon, Trash2, Eye, Wifi, WifiOff, Pause, Play, ExternalLink,
} from 'lucide-react';

const MAX_STATEMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_VIDEO_DURATION = 5; // seconds
const MAX_VIDEO_DURATION = 60; // seconds

export default function VerificationUploadModal({ payout, onClose, onSubmit }) {
  const { addToQueue, uploads } = useUpload();
  
  const [utrId, setUtrId] = useState(payout.utr || '');
  const [statementFile, setStatementFile] = useState(null);
  const [statementPreview, setStatementPreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  
  // Track upload IDs for this payout
  const [uploadIds, setUploadIds] = useState({ statement: null, video: null });
  
  const videoRef = useRef(null);

  // Watch for upload completion
  useEffect(() => {
    if (!uploadIds.statement && !uploadIds.video) return;
    
    const statementUpload = uploads.find(u => u.id === uploadIds.statement);
    const videoUpload = uploads.find(u => u.id === uploadIds.video);
    
    // Check if both uploads completed
    if (
      (!uploadIds.statement || statementUpload?.status === UploadStatus.COMPLETED) &&
      (!uploadIds.video || videoUpload?.status === UploadStatus.COMPLETED)
    ) {
      // Both uploads done, now submit the proof
      handleFinalSubmit(statementUpload?.url, videoUpload?.url);
    }
  }, [uploads, uploadIds]);

  // Handle statement file selection
  const handleStatementFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Statement must be an image (JPG, PNG) or PDF');
      return;
    }
    
    if (file.size > MAX_STATEMENT_SIZE) {
      setError('Statement file must be under 10MB');
      return;
    }
    
    setError(null);
    setStatementFile(file);
    
    if (file.type.startsWith('image/')) {
      setStatementPreview(URL.createObjectURL(file));
    } else {
      setStatementPreview('pdf');
    }
  };

  // Handle video file selection
  const handleVideoFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('video/')) {
      setError('Please upload a video file');
      return;
    }
    
    if (file.size > MAX_VIDEO_SIZE) {
      setError('Video must be under 50MB');
      return;
    }
    
    setError(null);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      const duration = video.duration;
      setVideoDuration(duration);
      
      if (duration < MIN_VIDEO_DURATION) {
        setError(`Video must be at least ${MIN_VIDEO_DURATION} seconds`);
      } else if (duration > MAX_VIDEO_DURATION) {
        setError(`Video must be under ${MAX_VIDEO_DURATION} seconds`);
      }
    };
    video.src = URL.createObjectURL(file);
  };

  // Clear files
  const clearStatement = () => {
    setStatementFile(null);
    setStatementPreview(null);
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setVideoDuration(null);
  };

  // Format file size
  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Final submit after uploads complete
  const handleFinalSubmit = async (statementUrl, videoUrl) => {
    if (!statementUrl || !videoUrl) return;
    
    try {
      // Call the RPC function to submit proof
      const { data: result, error: rpcError } = await supabase.rpc('submit_payout_proof', {
        p_payout_id: payout.id,
        p_statement_url: statementUrl,
        p_video_url: videoUrl,
      });
      
      if (rpcError) throw new Error(rpcError.message);
      if (!result?.success) throw new Error(result?.error || 'Failed to submit proof');
      
      // Update UTR if changed
      if (utrId && utrId !== payout.utr) {
        await supabase.from('payouts').update({ utr: utrId }).eq('id', payout.id);
      }
      
      onSubmit(result);
    } catch (err) {
      console.error('Submit error:', err);
      setError(err.message || 'Failed to submit proof');
      setSubmitting(false);
    }
  };

  // Start upload using global queue
  const handleSubmit = async () => {
    if (!utrId.trim()) {
      setError('UTR / Reference is required');
      return;
    }
    if (!statementFile) {
      setError('Statement proof is required');
      return;
    }
    if (!videoFile) {
      setError('Video proof is required');
      return;
    }
    if (videoDuration && (videoDuration < MIN_VIDEO_DURATION || videoDuration > MAX_VIDEO_DURATION)) {
      setError(`Video must be between ${MIN_VIDEO_DURATION}-${MAX_VIDEO_DURATION} seconds`);
      return;
    }
    
    setError(null);
    setSubmitting(true);
    
    const timestamp = Date.now();
    const payoutId = payout.id;
    
    // Prepare paths
    const statementExt = statementFile.name.split('.').pop();
    const statementPath = `statements/${payoutId}_${timestamp}.${statementExt}`;
    
    const videoExt = videoFile.name.split('.').pop();
    const videoPath = `videos/${payoutId}_${timestamp}.${videoExt}`;
    
    // Add both files to global upload queue
    const [statementUploadId] = addToQueue(statementFile, {
      bucket: 'payout-proofs',
      folder: 'statements',
      metadata: { payoutId, type: 'statement' },
      onComplete: ({ url }) => {
        console.log('Statement uploaded:', url);
      },
      onError: ({ error }) => {
        setError(`Statement upload failed: ${error}`);
        setSubmitting(false);
      },
    });
    
    const [videoUploadId] = addToQueue(videoFile, {
      bucket: 'payout-proofs',
      folder: 'videos',
      metadata: { payoutId, type: 'video' },
      onComplete: ({ url }) => {
        console.log('Video uploaded:', url);
      },
      onError: ({ error }) => {
        setError(`Video upload failed: ${error}`);
        setSubmitting(false);
      },
    });
    
    setUploadIds({ statement: statementUploadId, video: videoUploadId });
    
    // Close modal - uploads continue in background
    // User can navigate freely, UploadToast shows progress
    onClose();
  };

  const isValid = utrId.trim() && statementFile && videoFile && 
    (!videoDuration || (videoDuration >= MIN_VIDEO_DURATION && videoDuration <= MAX_VIDEO_DURATION));

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:w-full sm:max-w-lg bg-white shadow-2xl sm:rounded-2xl rounded-t-2xl overflow-hidden mt-auto sm:mt-0 max-h-[90vh] flex flex-col">
        {/* handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>
        
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">Submit Verification Proof</h3>
            <p className="text-xs text-slate-500">₹{(payout.amount || 0).toLocaleString()} • {payout.beneficiary_name || payout.beneficiaryName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center hover:bg-white/50 rounded-lg">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Background upload notice */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex gap-3">
            <Wifi className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-green-800">
              <p className="font-semibold mb-1">Background Upload Enabled</p>
              <p>After clicking submit, you can <span className="font-semibold">navigate to other pages</span>. Your upload continues in the background and you'll see progress in the corner.</p>
            </div>
          </div>

          {/* UTR input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              UTR / Reference Number *
            </label>
            <input 
              type="text" 
              value={utrId} 
              onChange={e => setUtrId(e.target.value)} 
              placeholder="Enter transaction reference"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent font-mono"
            />
          </div>

          {/* Statement upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              📄 Bank Statement / Screenshot *
            </label>
            {statementPreview ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {statementPreview === 'pdf' ? (
                  <div className="flex items-center gap-3 p-4 bg-slate-50">
                    <FileText className="w-10 h-10 text-red-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{statementFile?.name}</p>
                      <p className="text-xs text-slate-500">{formatSize(statementFile?.size)}</p>
                    </div>
                  </div>
                ) : (
                  <img src={statementPreview} alt="Statement" className="w-full max-h-48 object-contain bg-slate-50" />
                )}
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Ready
                  </span>
                  <button onClick={clearStatement}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <label htmlFor="statement-upload"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                <ImageIcon className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">Tap to upload statement</p>
                <p className="text-xs text-slate-400">JPG, PNG or PDF • Max 10MB</p>
                <input type="file" accept="image/*,.pdf" onChange={handleStatementFile} className="hidden" id="statement-upload" />
              </label>
            )}
          </div>

          {/* Video upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wide">
              🎥 Screen Recording / Video Proof *
            </label>
            {videoPreview ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <video 
                  ref={videoRef}
                  src={videoPreview} 
                  controls 
                  className="w-full max-h-48 bg-black"
                />
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Ready
                    </span>
                    {videoDuration && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        videoDuration >= MIN_VIDEO_DURATION && videoDuration <= MAX_VIDEO_DURATION 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {Math.round(videoDuration)}s
                      </span>
                    )}
                  </div>
                  <button onClick={clearVideo}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <label htmlFor="video-upload"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                <Video className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">Tap to upload video</p>
                <p className="text-xs text-slate-400">MP4, MOV, WebM • {MIN_VIDEO_DURATION}-{MAX_VIDEO_DURATION}s • Max 50MB</p>
                <input type="file" accept="video/*" onChange={handleVideoFile} className="hidden" id="video-upload" />
              </label>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-2.5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white active:bg-slate-100">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!isValid || submitting}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97] transition-transform">
            {submitting
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Starting…</>
              : <><Upload className="w-4 h-4" /> Submit & Continue</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
