import React, { useState, useRef } from 'react';
import { supabase } from '../../../../supabase';
import {
  X, RefreshCw, CheckCircle, Upload, FileText, Video, AlertCircle,
  Image as ImageIcon, Trash2, Eye,
} from 'lucide-react';

const MAX_STATEMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MIN_VIDEO_DURATION = 5; // seconds
const MAX_VIDEO_DURATION = 60; // seconds

export default function VerificationUploadModal({ payout, onClose, onSubmit }) {
  const [utrId, setUtrId] = useState(payout.utr || '');
  const [statementFile, setStatementFile] = useState(null);
  const [statementPreview, setStatementPreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [videoDuration, setVideoDuration] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ statement: 0, video: 0 });
  const [error, setError] = useState(null);
  
  const videoRef = useRef(null);

  // Handle statement file selection
  const handleStatementFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Statement must be an image (JPG, PNG) or PDF');
      return;
    }
    
    // Validate size
    if (file.size > MAX_STATEMENT_SIZE) {
      setError('Statement file must be under 10MB');
      return;
    }
    
    setError(null);
    setStatementFile(file);
    
    // Preview for images
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
    
    // Validate type
    if (!file.type.startsWith('video/')) {
      setError('Please upload a video file');
      return;
    }
    
    // Validate size
    if (file.size > MAX_VIDEO_SIZE) {
      setError('Video must be under 50MB');
      return;
    }
    
    setError(null);
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    
    // Check duration
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

  // Clear file
  const clearStatement = () => {
    setStatementFile(null);
    setStatementPreview(null);
  };

  const clearVideo = () => {
    setVideoFile(null);
    setVideoPreview(null);
    setVideoDuration(null);
  };

  // Upload files and submit
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
    setUploading(true);
    
    try {
      const timestamp = Date.now();
      const payoutId = payout.id;
      
      // Upload statement
      setUploadProgress(p => ({ ...p, statement: 10 }));
      const statementExt = statementFile.name.split('.').pop();
      const statementPath = `statements/${payoutId}_${timestamp}.${statementExt}`;
      
      const { data: statementData, error: statementError } = await supabase.storage
        .from('payout-proofs')
        .upload(statementPath, statementFile, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (statementError) throw new Error('Failed to upload statement: ' + statementError.message);
      setUploadProgress(p => ({ ...p, statement: 100 }));
      
      // Get statement URL
      const { data: statementUrlData } = supabase.storage
        .from('payout-proofs')
        .getPublicUrl(statementPath);
      const statementUrl = statementUrlData.publicUrl;
      
      // Upload video
      setUploadProgress(p => ({ ...p, video: 10 }));
      const videoExt = videoFile.name.split('.').pop();
      const videoPath = `videos/${payoutId}_${timestamp}.${videoExt}`;
      
      const { data: videoData, error: videoError } = await supabase.storage
        .from('payout-proofs')
        .upload(videoPath, videoFile, {
          cacheControl: '3600',
          upsert: false,
        });
      
      if (videoError) throw new Error('Failed to upload video: ' + videoError.message);
      setUploadProgress(p => ({ ...p, video: 100 }));
      
      // Get video URL
      const { data: videoUrlData } = supabase.storage
        .from('payout-proofs')
        .getPublicUrl(videoPath);
      const videoUrl = videoUrlData.publicUrl;
      
      // Call the RPC function to submit proof
      const { data: result, error: rpcError } = await supabase.rpc('submit_payout_proof', {
        p_payout_id: payoutId,
        p_statement_url: statementUrl,
        p_video_url: videoUrl,
      });
      
      if (rpcError) throw new Error(rpcError.message);
      if (!result?.success) throw new Error(result?.error || 'Failed to submit proof');
      
      // Also update UTR if not already set
      if (utrId && utrId !== payout.utr) {
        await supabase.from('payouts').update({ utr: utrId }).eq('id', payoutId);
      }
      
      onSubmit(result);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const totalProgress = (uploadProgress.statement + uploadProgress.video) / 2;
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
          <button onClick={onClose} disabled={uploading} className="w-8 h-8 flex items-center justify-center hover:bg-white/50 rounded-lg disabled:opacity-40">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Info banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800">
              <p className="font-semibold mb-1">Verification Required</p>
              <p>Upload bank statement and screen recording as proof. Your balance will be credited after admin verification.</p>
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
              disabled={uploading}
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
                      <p className="text-xs text-slate-500">{(statementFile?.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                ) : (
                  <img src={statementPreview} alt="Statement" className="w-full max-h-48 object-contain bg-slate-50" />
                )}
                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between bg-white">
                  <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Uploaded
                  </span>
                  <button onClick={clearStatement} disabled={uploading}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40 flex items-center gap-1">
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
                <input type="file" accept="image/*,.pdf" onChange={handleStatementFile} disabled={uploading} className="hidden" id="statement-upload" />
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
                    <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Uploaded
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
                  <button onClick={clearVideo} disabled={uploading}
                    className="text-xs text-red-500 font-semibold hover:text-red-700 disabled:opacity-40 flex items-center gap-1">
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
                <input type="file" accept="video/*" onChange={handleVideoFile} disabled={uploading} className="hidden" id="video-upload" />
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

          {/* Upload progress */}
          {uploading && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-blue-800">Uploading proofs…</p>
                <p className="text-xs font-bold text-blue-800">{Math.round(totalProgress)}%</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-600 w-16">Statement</span>
                  <div className="flex-1 bg-blue-200 rounded-full h-1.5">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress.statement}%` }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-600 w-16">Video</span>
                  <div className="flex-1 bg-blue-200 rounded-full h-1.5">
                    <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${uploadProgress.video}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex gap-2.5">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-white active:bg-slate-100 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!isValid || uploading}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97] transition-transform">
            {uploading
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</>
              : <><CheckCircle className="w-4 h-4" /> Submit for Verification</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
