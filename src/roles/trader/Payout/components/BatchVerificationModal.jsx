import React, { useState, useRef } from 'react';
import { X, Upload, Video, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../../../supabase';

/**
 * Batch verification modal - ONE video + ONE statement for all completed payouts in a request
 */
export default function BatchVerificationModal({ request, completedPayouts, onClose, onSubmit }) {
  const [statementFile, setStatementFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);

  const statementRef = useRef();
  const videoRef = useRef();

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
    setError('');
  };

  const handleSubmit = async () => {
    if (!statementFile || !videoFile) {
      setError('Both statement and video are required');
      return;
    }

    setUploading(true);
    setError('');
    setUploadProgress(0);

    try {
      const timestamp = Date.now();
      const requestId = request.id;

      // Upload statement
      setUploadProgress(10);
      const statementExt = statementFile.name.split('.').pop();
      const statementPath = `batch-verification/${requestId}/statement_${timestamp}.${statementExt}`;
      
      const { error: stmtError } = await supabase.storage
        .from('payout-proofs')
        .upload(statementPath, statementFile);
      
      if (stmtError) throw new Error('Failed to upload statement: ' + stmtError.message);
      
      setUploadProgress(40);

      // Upload video
      const videoExt = videoFile.name.split('.').pop();
      const videoPath = `batch-verification/${requestId}/video_${timestamp}.${videoExt}`;
      
      const { error: vidError } = await supabase.storage
        .from('payout-proofs')
        .upload(videoPath, videoFile);
      
      if (vidError) throw new Error('Failed to upload video: ' + vidError.message);
      
      setUploadProgress(70);

      // Get public URLs
      const { data: stmtUrl } = supabase.storage.from('payout-proofs').getPublicUrl(statementPath);
      const { data: vidUrl } = supabase.storage.from('payout-proofs').getPublicUrl(videoPath);

      setUploadProgress(80);

      // Update payout request with verification
      const { error: updateError } = await supabase
        .from('payout_requests')
        .update({
          verification_status: 'pending_review',
          statement_proof_url: stmtUrl.publicUrl,
          video_proof_url: vidUrl.publicUrl,
          verification_submitted_at: new Date().toISOString(),
          status: 'pending_verification',
        })
        .eq('id', requestId);

      if (updateError) throw new Error('Failed to update request: ' + updateError.message);

      setUploadProgress(90);

      // Update all completed payouts to pending_verification
      const payoutIds = completedPayouts.map(p => p.id);
      await supabase
        .from('payouts')
        .update({ verification_status: 'pending_review' })
        .in('id', payoutIds);

      setUploadProgress(100);

      onSubmit({ 
        success: true, 
        payoutCount: completedPayouts.length,
        totalAmount 
      });
    } catch (err) {
      console.error('Verification upload error:', err);
      setError(err.message || 'Upload failed');
    }
    
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
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
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {/* Statement upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5 inline mr-1" />
              Bank Statement *
            </label>
            <input
              ref={statementRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleStatementChange}
              className="hidden"
            />
            <button
              onClick={() => statementRef.current?.click()}
              className={`w-full p-4 border-2 border-dashed rounded-xl text-center transition-all ${
                statementFile 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-slate-300 hover:border-purple-400 hover:bg-purple-50'
              }`}
            >
              {statementFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-semibold text-green-700">{statementFile.name}</span>
                </div>
              ) : (
                <div>
                  <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-slate-600">Upload Statement</p>
                  <p className="text-xs text-slate-400">Image or PDF, max 10MB</p>
                </div>
              )}
            </button>
          </div>

          {/* Video upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">
              <Video className="w-3.5 h-3.5 inline mr-1" />
              Video Proof *
            </label>
            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              onChange={handleVideoChange}
              className="hidden"
            />
            <button
              onClick={() => videoRef.current?.click()}
              className={`w-full p-4 border-2 border-dashed rounded-xl text-center transition-all ${
                videoFile 
                  ? 'border-green-300 bg-green-50' 
                  : 'border-slate-300 hover:border-purple-400 hover:bg-purple-50'
              }`}
            >
              {videoFile ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-semibold text-green-700">{videoFile.name}</span>
                </div>
              ) : (
                <div>
                  <Video className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                  <p className="text-sm font-semibold text-slate-600">Upload Video</p>
                  <p className="text-xs text-slate-400">5-60 seconds, max 50MB</p>
                </div>
              )}
            </button>
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

          {/* Progress bar */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Uploading...</span>
                <span className="font-semibold text-purple-600">{uploadProgress}%</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="px-4 py-3 border-t border-slate-100 flex gap-2.5">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 py-2.5 border border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!statementFile || !videoFile || uploading}
            className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold disabled:opacity-40 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Submit for Review
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
