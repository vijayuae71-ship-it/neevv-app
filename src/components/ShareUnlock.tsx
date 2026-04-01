'use client';

import React, { useState, useEffect } from 'react';
import { Share2, Gift, Copy, CheckCircle2, MessageCircle, X } from 'lucide-react';

const SHARE_STORAGE_KEY = 'neevv_share_credits';
const SHARES_NEEDED = 3;
const CREDITS_PER_UNLOCK = 9;

interface ShareCredits {
  totalShares: number;
  reRenderCredits: number;
  shareLinks: string[];
}

function getCredits(): ShareCredits {
  try {
    const saved = localStorage.getItem(SHARE_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { totalShares: 0, reRenderCredits: 0, shareLinks: [] };
}

function saveCredits(credits: ShareCredits) {
  localStorage.setItem(SHARE_STORAGE_KEY, JSON.stringify(credits));
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreditsUpdate?: (credits: number) => void;
}

export const ShareUnlock: React.FC<Props> = ({ isOpen, onClose, onCreditsUpdate }) => {
  const [credits, setCredits] = useState<ShareCredits>(getCredits());
  const [copied, setCopied] = useState(false);
  const [shareMethod, setShareMethod] = useState<'whatsapp' | 'copy' | null>(null);

  const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://neevv.app';
  const shareText = `🏠 I just designed my dream home using neevv — AI-powered architecture studio! Free floor plans, 3D renders, working drawings & BOQ. Try it: ${shareUrl}`;

  const handleWhatsAppShare = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
    recordShare('whatsapp');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      recordShare('copy');
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      recordShare('copy');
    }
  };

  const recordShare = (method: string) => {
    const updated = { ...credits };
    updated.totalShares += 1;
    updated.shareLinks.push(`${method}-${Date.now()}`);
    
    // Every 3 shares = 9 credits
    if (updated.totalShares % SHARES_NEEDED === 0) {
      updated.reRenderCredits += CREDITS_PER_UNLOCK;
    }
    
    setCredits(updated);
    saveCredits(updated);
    onCreditsUpdate?.(updated.reRenderCredits);
    setShareMethod(method as any);
  };

  const sharesUntilNextUnlock = SHARES_NEEDED - (credits.totalShares % SHARES_NEEDED);
  const progressPercent = ((SHARES_NEEDED - sharesUntilNextUnlock) / SHARES_NEEDED) * 100;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Gift size={20} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Unlock Re-Renders</h3>
              <p className="text-xs text-gray-500">Share with friends to earn credits</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
            <X size={18} />
          </button>
        </div>

        {/* Credits display */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{credits.reRenderCredits}</div>
          <div className="text-xs text-gray-600 mt-1">Re-Render Credits Available</div>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Share {sharesUntilNextUnlock} more to unlock {CREDITS_PER_UNLOCK} credits</span>
            <span>{credits.totalShares % SHARES_NEEDED}/{SHARES_NEEDED}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Share buttons */}
        <div className="space-y-3">
          <button
            className="btn btn-success w-full gap-2"
            onClick={handleWhatsAppShare}
          >
            <MessageCircle size={18} /> Share on WhatsApp
          </button>
          <button
            className="btn btn-outline w-full gap-2"
            onClick={handleCopyLink}
          >
            {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
            {copied ? 'Link Copied!' : 'Copy Share Link'}
          </button>
        </div>

        {/* How it works */}
        <div className="text-xs text-gray-500 space-y-1 bg-gray-50 rounded-lg p-3">
          <p className="font-semibold text-gray-700">How it works:</p>
          <p>• First render is always FREE for all 13 drawings</p>
          <p>• Want to re-generate? Share with 3 friends → earn 9 re-render credits</p>
          <p>• Downloads are free forever (cached)</p>
        </div>
      </div>
    </div>
  );
};

// Hook for checking credits
export function useShareCredits() {
  const [credits, setCredits] = useState(0);
  
  useEffect(() => {
    const data = getCredits();
    setCredits(data.reRenderCredits);
  }, []);

  const useCredit = () => {
    const data = getCredits();
    if (data.reRenderCredits > 0) {
      data.reRenderCredits -= 1;
      saveCredits(data);
      setCredits(data.reRenderCredits);
      return true;
    }
    return false;
  };

  return { credits, useCredit, refresh: () => setCredits(getCredits().reRenderCredits) };
}
