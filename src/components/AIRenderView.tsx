'use client';

import React, { useState } from 'react';
import { Layout, ProjectRequirements } from '../types';
import { buildArchitecturalPrompt } from '../utils/aiRenderPrompt';
import { Camera, RefreshCw, Download, AlertTriangle, Sparkles, Eye } from 'lucide-react';

const MODELS = [
  { id: 'neevv-gen', label: 'neevv Gen' },
  { id: 'neevv-gen-2', label: 'neevv Gen 2' },
  { id: 'neevv-gen-pro', label: 'neevv Gen Pro' },
];

const VIEW_ANGLES = [
  { id: 'front-3/4' as const, label: 'Front 3/4', icon: '🏠' },
  { id: 'front-elevation' as const, label: 'Front Elevation', icon: '🏗️' },
  { id: 'rear-3/4' as const, label: 'Rear 3/4', icon: '🔄' },
  { id: 'bird-eye' as const, label: 'Bird Eye', icon: '🦅' },
];

interface Props {
  layout: Layout;
  requirements: ProjectRequirements;
}

interface RenderResult {
  viewAngle: string;
  imageData: string; // URL or data URI
  timestamp: number;
}

export const AIRenderView: React.FC<Props> = ({ layout, requirements }) => {
  const [renders, setRenders] = useState<RenderResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState<'front-3/4' | 'rear-3/4' | 'front-elevation' | 'bird-eye'>('front-3/4');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [activeRender, setActiveRender] = useState<RenderResult | null>(null);
  const [progress, setProgress] = useState('');

  async function generateRender() {
    setLoading(true);
    setError(null);
    setProgress('Building architectural prompt...');

    try {
      const prompt = buildArchitecturalPrompt(layout, requirements, selectedView);
      
      setProgress('neevv Generation Pro rendering...');

      const response = await fetch('/api/generate-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          projectId: 'user-project',
          renderType: selectedView,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError('Rate limit reached. Please wait a few minutes and try again.');
        } else {
          setError(data.error || `API Error (${response.status})`);
        }
        setLoading(false);
        return;
      }

      if (!data.success) {
        setError(data.error || 'No image generated');
        setLoading(false);
        return;
      }

      setProgress('Processing AI-generated image...');

      // Use either the GCS public URL or the inline base64 data
      const imageUrl = data.imageUrl || data.imageDataUri;

      if (!imageUrl) {
        setError('No image returned from API');
        setLoading(false);
        return;
      }

      const newRender: RenderResult = {
        viewAngle: selectedView,
        imageData: imageUrl,
        timestamp: Date.now(),
      };

      const updatedRenders = [newRender, ...renders.slice(0, 7)];
      setRenders(updatedRenders);
      setActiveRender(newRender);
      setProgress('');
    } catch (err: any) {
      console.error('AI Render failed:', err);
      setError(`Generation failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  function downloadRender() {
    if (!activeRender) return;
    const a = document.createElement('a');
    a.href = activeRender.imageData;
    a.download = `neevv-render-${activeRender.viewAngle}-${activeRender.timestamp}.png`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  const viewLabel = VIEW_ANGLES.find(v => v.id === selectedView)?.label || selectedView;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 bg-gray-100 rounded-lg mb-2 flex-wrap">
        <Sparkles size={16} className="text-amber-500 flex-shrink-0" />
        <span className="text-sm font-semibold text-gray-700 flex-shrink-0">AI Render</span>
        
        <div className="hidden sm:block w-px h-5 bg-gray-300 mx-1" />
        
        {/* View angle selector */}
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-gray-600">View:</span>
          {VIEW_ANGLES.map(v => (
            <button
              key={v.id}
              className={`btn btn-xs ${selectedView === v.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSelectedView(v.id)}
              disabled={loading}
            >
              <span className="hidden sm:inline">{v.icon}</span> {v.label}
            </button>
          ))}
        </div>

        <div className="hidden sm:block w-px h-5 bg-gray-300 mx-1" />

        {/* Model selector */}
        <select
          className="select select-xs select-bordered"
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          disabled={loading}
        >
          {MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>

        <div className="flex-1" />

        {/* Generate button */}
        <button
          className="btn btn-sm btn-primary gap-1"
          onClick={generateRender}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs" />
              Generating...
            </>
          ) : (
            <>
              <Camera size={14} />
              Generate {viewLabel}
            </>
          )}
        </button>

        {activeRender && (
          <button
            className="btn btn-xs btn-ghost"
            onClick={downloadRender}
            title="Download render"
          >
            <Download size={14} />
          </button>
        )}
      </div>

      {/* Main render area */}
      <div className="flex-1 rounded-lg overflow-hidden bg-gray-200 min-h-0 relative" style={{ minHeight: '400px' }}>
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-gray-200">
            <span className="loading loading-spinner loading-lg text-blue-600 mb-4" />
            <p className="text-sm text-gray-700">{progress || 'Generating AI render...'}</p>
            <p className="text-xs text-gray-500 mt-2">This may take 15-30 seconds</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-x-0 top-0 z-20 p-3">
            <div className="alert alert-warning shadow-lg">
              <AlertTriangle size={16} />
              <div>
                <p className="text-sm">{error}</p>
                {error.includes('Rate limit') && (
                  <p className="text-xs mt-1 text-gray-600">
                    Tip: Enable billing at <a href="https://ai.dev/projects" target="_blank" rel="noopener noreferrer" className="underline">ai.dev/projects</a> for unlimited generations.
                  </p>
                )}
              </div>
              <button className="btn btn-xs btn-ghost" onClick={() => setError(null)}>✕</button>
            </div>
          </div>
        )}

        {activeRender ? (
          <>
            <img
              src={activeRender.imageData}
              alt={`AI Render - ${activeRender.viewAngle}`}
              className="w-full h-full object-contain"
            />
          </>
        ) : !loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Camera size={48} className="mb-4 opacity-80" />
            <p className="text-lg font-medium text-gray-700">AI Photorealistic Render</p>
            <p className="text-sm mt-2 max-w-md text-center text-gray-600">
              Generate a professional V-Ray quality architectural render from your floor plan using neevv Generation Pro.
              Select a view angle and click <strong>Generate</strong>.
            </p>
            <p className="text-xs mt-4 text-gray-400">
              Powered by neevv Generation Pro Engine
            </p>
          </div>
        )}
      </div>

      {/* Render history thumbnails */}
      {renders.length > 1 && (
        <div className="flex gap-2 mt-2 p-2 bg-gray-100 rounded-lg overflow-x-auto">
          <span className="text-xs text-gray-600 self-center whitespace-nowrap">History:</span>
          {renders.map((r) => (
            <button
              key={r.timestamp}
              className={`flex-shrink-0 rounded border-2 overflow-hidden transition-all ${
                activeRender?.timestamp === r.timestamp 
                  ? 'border-green-500 ring-2 ring-green-300' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setActiveRender(r)}
              title={`${r.viewAngle} - ${new Date(r.timestamp).toLocaleTimeString()}`}
            >
              {r.imageData ? (
                <img src={r.imageData} alt={r.viewAngle} className="w-16 h-10 object-cover" />
              ) : (
                <div className="w-16 h-10 bg-gray-200 flex items-center justify-center">
                  <Eye size={12} className="text-gray-400" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
