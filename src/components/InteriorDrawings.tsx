'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Room, RoomInterior } from '../types';
import { Sparkles, Download, AlertTriangle, Loader2, Camera } from 'lucide-react';
import { authFetch } from '@/utils/authFetch';
import { getCachedDrawing, setCachedDrawing } from '@/utils/drawingCache';

interface Props { layout: Layout; rooms: RoomInterior[]; }
type InteriorDrawingType = 'furniture' | 'ceiling' | 'electrical' | 'woodwork' | 'flooring';
const DRAWING_TYPES: { key: InteriorDrawingType; label: string }[] = [
  { key: 'furniture', label: 'Furniture Layout' }, { key: 'ceiling', label: 'False Ceiling' },
  { key: 'electrical', label: 'Electrical Layout' }, { key: 'woodwork', label: 'Woodwork Details' },
  { key: 'flooring', label: 'Flooring Layout' },
];
const ROOM_TYPE_LABELS: Record<string, string> = {
  master_bedroom: 'Master Bedroom', bedroom: 'Bedroom', hall: 'Hall', living: 'Living Room',
  kitchen: 'Kitchen', toilet: 'Toilet', dining: 'Dining', puja: 'Puja Room', balcony: 'Balcony', staircase: 'Staircase',
};
function roomLabel(room: Room): string { return room.name || ROOM_TYPE_LABELS[room.type] || room.type; }
function mToFt(m: number): number { return Math.round(m * 3.281); }
function mmDim(m: number): number { return Math.round(m * 1000); }

function buildInteriorDrawingPrompt(type: InteriorDrawingType, room: Room, interior: RoomInterior | undefined): string {
  const name = roomLabel(room), wFt = mToFt(room.width), dFt = mToFt(room.depth), wMm = mmDim(room.width), dMm = mmDim(room.depth);
  const style = interior?.style?.replace(/_/g, ' ') || 'modern minimalist', area = wFt * dFt;
  const common = `
ROOM: ${name}
DIMENSIONS: ${wFt}' × ${dFt}' (${wMm}mm × ${dMm}mm), Area: ${area} sqft
STYLE: ${style}
DRAWING FORMAT:
- Professional black-and-white engineering drawing
- Scale 1:50
- All dimensions in mm with tick-mark dimension chains
- Clean white background
- Wall thickness: 150mm internal (double-line, 0.4mm weight)
- Room boundary clearly shown with walls
- Title block at bottom: "${name} — ${wFt}'×${dFt}'"
- PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION
SPELLING: SCHEDULE, REINFORCEMENT, WATERPROOFING, CALCULATION, ABBREVIATION, STAIRCASE`;
  const bedroom = room.type === 'master_bedroom' || room.type === 'bedroom', commonArea = room.type === 'hall' || room.type === 'living';
  switch (type) {
    case 'furniture': return `Generate a professional FURNITURE LAYOUT PLAN for an interior room.\n${common}\nSPECIFIC REQUIREMENTS:
- Top-down plan view showing all furniture placed inside the room
- ${room.type === 'kitchen' ? 'Show kitchen platform (L/U/parallel), sink, hob, refrigerator placement, overhead cabinets (dashed)' : ''}
- ${bedroom ? 'Show bed (king/queen), wardrobe, side tables, study desk if space allows, dressing unit' : ''}
- ${commonArea ? 'Show sofa set, center table, TV unit, shoe rack near entry, dining if combined' : ''}
- ${room.type === 'dining' ? 'Show dining table with chairs (4/6 seater based on room size), crockery unit, wash basin if near kitchen' : ''}
- ${room.type === 'toilet' ? 'Show WC, wash basin with vanity, shower area with glass partition, geyser position, mirror' : ''}
- ${room.type === 'balcony' ? 'Show planter boxes, seating, railing, utility area if applicable' : ''}
- ${room.type === 'puja' ? 'Show puja shelf/unit, bell, storage, seating mat area' : ''}
- Furniture shown as filled/hatched rectangles with labels
- Clear circulation paths (minimum 900mm)
- Door shown with swing arc, window shown with glass symbol
- Movement arrows showing traffic flow`;
    case 'ceiling': return `Generate a professional FALSE CEILING LAYOUT PLAN (Reflected Ceiling Plan) for an interior room.\n${common}\nSPECIFIC REQUIREMENTS:
- Reflected ceiling plan (RCP) — view looking up at ceiling
- Show false ceiling levels: Level 1 (main drop at 150mm), Level 2 (peripheral tray at 225mm)
- Gypsum board edges shown as dashed lines; cove lighting pockets as dotted rectangles
- Recessed downlights marked ⊕ with spacing 900-1200mm
- ${bedroom ? 'Central pendant/chandelier point, ambient cove around bed wall' : ''}
- ${commonArea ? 'Feature ceiling over seating area, peripheral cove all around, chandelier point' : ''}
- ${room.type === 'kitchen' ? 'Flat ceiling with recessed lights over counter, no cove over hob area (fire safety)' : ''}
- ${room.type === 'dining' ? 'Pendant point centered over table, peripheral cove' : ''}
- ${room.type === 'toilet' ? 'Moisture-rated flat ceiling, exhaust fan position marked, IP65 recessed lights' : ''}
- Fan hook position ⊗, AC point if applicable
- Legend: ⊕ Downlight, ⊗ Fan Point, ⊞ AC Point, --- Cove
- Section detail showing ceiling levels with dimensions (side cutaway)`;
    case 'electrical': return `Generate a professional ELECTRICAL LAYOUT PLAN for an interior room.\n${common}\nSPECIFIC REQUIREMENTS:
- Show all electrical points with standard IS symbols
- Switch boards near door entry (1200mm from floor); sockets 300mm general, 1050mm kitchen counter, 1800mm AC
- ${room.type === 'kitchen' ? 'Dedicated labeled sockets: refrigerator, microwave, mixer, chimney, water purifier' : ''}
- ${bedroom ? 'Bed-side sockets both sides, AC, TV, study area socket, wardrobe light point' : ''}
- ${commonArea ? 'TV unit 4-gang sockets, sofa-side, AC and router sockets' : ''}
- ${room.type === 'toilet' ? 'Geyser socket (high), mirror light, exhaust fan switch, shaver socket' : ''}
- Light points: ⊕ ceiling, → wall, ⊗ fan; switch points ◘ single, ◙ double; sockets ⊡ 5A, ⊞ 15A
- Circuit routing shown dashed from DB; legend with all symbols; EARTHING points marked`;
    case 'woodwork': return `Generate a professional WOODWORK & JOINERY DETAIL DRAWING for an interior room.\n${common}\nSPECIFIC REQUIREMENTS:
- Front elevation views of all major woodwork items
- ${bedroom ? 'Wardrobe elevation with shelves, drawers, hanging rod, loft and dimensions; bed headboard with built-in side tables; study table if applicable' : ''}
- ${room.type === 'kitchen' ? 'Kitchen elevation: base cabinets 850mm, 25mm granite counter, upper cabinets at 1500mm (600mm deep), sink/hob cutouts, chimney and shelf dimensions' : ''}
- ${commonArea ? 'TV unit elevation with open shelves, closed cabinets, cable management and dimensioned back panel; shoe cabinet near entry' : ''}
- ${room.type === 'dining' ? 'Crockery unit elevation: glass-fronted upper, closed lower and dimensioned counter' : ''}
- ${room.type === 'toilet' ? 'Vanity elevation with basin cutout, mirror cabinet and dimensioned shelving' : ''}
- ${room.type === 'puja' ? 'Puja unit elevation with deity shelf, bell hook, storage drawers and LED strip positions' : ''}
- Material callouts: BWR plywood 18mm, laminate/veneer finish, 38mm marine ply counter
- Hardware: soft-close hinges, telescopic channels, handles; section cuts through cabinets; all dimensions in mm`;
    case 'flooring': return `Generate a professional FLOORING LAYOUT PLAN for an interior room.\n${common}\nSPECIFIC REQUIREMENTS:
- Top-down plan showing tile/flooring pattern, thin tile joint grid, starting point and laying direction arrow
- ${room.type === 'kitchen' ? 'Anti-skid ceramic tiles 600×600mm, contrasting 100mm border, slope toward floor drain' : ''}
- ${bedroom ? 'Vitrified tiles 800×800mm or wooden laminate planks 1200×200mm, 100mm skirting' : ''}
- ${commonArea ? 'Large format vitrified tiles 800×800mm, feature border, carpet area dashed' : ''}
- ${room.type === 'dining' ? 'Tiles matching hall with accent tile under dining area' : ''}
- ${room.type === 'toilet' ? 'Anti-skid 300×300mm floor tiles, 300×450mm wall tiles to 2100mm, slope 1:40 to drain, different shower pattern' : ''}
- ${room.type === 'balcony' ? 'Weather-resistant anti-skid tiles, slope 1:40 toward drain outlet' : ''}
- Choose running bond/grid/diagonal appropriately; skirting hatched 100mm, thresholds at doors
- 45° hatching for wet areas per IS 962:1989; show edge cuts and legend with tile types, sizes and areas`;
  }
}

const InteriorDrawings: React.FC<Props> = ({ layout, rooms }) => {
  const [activeDrawingType, setActiveDrawingType] = useState<InteriorDrawingType>('furniture');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false), [loadingAll, setLoadingAll] = useState(false), [error, setError] = useState<string | null>(null);
  const allRooms = layout.floors.flatMap(f => f.rooms).filter(r => r.type !== 'staircase');
  useEffect(() => { if (!selectedRoomId && allRooms.length) setSelectedRoomId(allRooms[0].id); }, [allRooms, selectedRoomId]);
  useEffect(() => { (async () => { for (const room of allRooms) for (const dt of DRAWING_TYPES) { const key = `interior-${dt.key}-${room.id}`; if (!imageCache[key]) { const cached = await getCachedDrawing(key); if (cached) setImageCache(p => ({ ...p, [key]: cached })); } } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const currentKey = `interior-${activeDrawingType}-${selectedRoomId}`, currentImage = imageCache[currentKey];
  const selectedRoom = allRooms.find(r => r.id === selectedRoomId), interiorData = rooms.find(r => r.roomId === selectedRoomId || r.roomName === selectedRoom?.name);
  const generateDrawing = useCallback(async (drawingType: InteriorDrawingType, roomId: string) => {
    const room = allRooms.find(r => r.id === roomId); if (!room) return;
    const interior = rooms.find(r => r.roomId === roomId || r.roomName === room.name), key = `interior-${drawingType}-${roomId}`;
    const res = await authFetch('/api/generate-drawing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: buildInteriorDrawingPrompt(drawingType, room, interior), drawingType: `interior_${drawingType}` }) });
    const data = await res.json(); if (data.success && data.imageDataUri) { await setCachedDrawing(key, data.imageDataUri); setImageCache(p => ({ ...p, [key]: data.imageDataUri })); return true; }
    throw new Error(data.error || 'Failed to generate drawing');
  }, [allRooms, rooms]);
  const handleGenerate = useCallback(async () => { if (!selectedRoomId) return; setLoading(true); setError(null); try { await generateDrawing(activeDrawingType, selectedRoomId); } catch (e: any) { setError(e.message || 'Generation failed'); } finally { setLoading(false); } }, [selectedRoomId, activeDrawingType, generateDrawing]);
  const handleGenerateAll = useCallback(async () => { if (!selectedRoomId) return; setLoadingAll(true); setError(null); for (const dt of DRAWING_TYPES) { if (imageCache[`interior-${dt.key}-${selectedRoomId}`]) continue; try { await generateDrawing(dt.key, selectedRoomId); } catch (e: any) { setError(`${dt.label}: ${e.message}`); break; } } setLoadingAll(false); }, [selectedRoomId, imageCache, generateDrawing]);
  const handleDownload = useCallback((image: string) => { const a = document.createElement('a'); a.href = image; a.download = `neevv-${activeDrawingType}-${selectedRoom ? roomLabel(selectedRoom) : 'room'}-${Date.now()}.png`; a.style.display = 'none'; document.body.appendChild(a); a.click(); document.body.removeChild(a); }, [activeDrawingType, selectedRoom]);
  const isLoading = loading || loadingAll;
  return <div className="p-3 space-y-4">
    <div className="space-y-2"><div className="flex flex-wrap gap-2">{DRAWING_TYPES.map(dt => <button key={dt.key} onClick={() => { setActiveDrawingType(dt.key); setError(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeDrawingType === dt.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{dt.label}</button>)}</div></div>
    <div className="space-y-2"><p className="text-xs font-medium text-gray-500">Room:</p><div className="flex flex-wrap gap-2">{allRooms.map(room => { const hasAny = DRAWING_TYPES.some(dt => imageCache[`interior-${dt.key}-${room.id}`]); return <button key={room.id} onClick={() => { setSelectedRoomId(room.id); setError(null); }} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedRoomId === room.id ? 'bg-blue-600 text-white' : hasAny ? 'bg-green-50 text-green-700 border border-green-300 hover:bg-green-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{roomLabel(room)}</button>; })}</div></div>
    <div className="flex items-center gap-2"><button onClick={handleGenerate} disabled={isLoading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 text-sm">{loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Generate</button><button onClick={handleGenerateAll} disabled={isLoading} className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-100 disabled:opacity-60 flex items-center gap-2 text-sm">{loadingAll ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} All 5</button></div>
    {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2"><AlertTriangle size={16} className="text-red-600 flex-shrink-0" /><span className="text-sm text-red-800 flex-1">{error}</span><button className="text-red-400 hover:text-red-600 text-sm" onClick={() => setError(null)}>✕</button></div>}
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">{isLoading && !currentImage && <div className="flex flex-col items-center justify-center py-24 gap-3"><Loader2 size={32} className="text-blue-600 animate-spin" /><p className="text-sm text-blue-600 font-medium animate-pulse">Generating {DRAWING_TYPES.find(dt => dt.key === activeDrawingType)?.label} for {selectedRoom ? roomLabel(selectedRoom) : '...'}…</p></div>}{currentImage ? <div className="relative"><img src={currentImage} alt={`${activeDrawingType} drawing`} className="w-full h-auto" /><div className="absolute top-2 right-2 flex gap-1"><button onClick={() => handleDownload(currentImage)} className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white shadow" title="Download"><Download size={14} className="text-gray-700" /></button><button onClick={handleGenerate} disabled={isLoading} className="w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center hover:bg-white shadow disabled:opacity-60" title="Regenerate"><Sparkles size={14} className="text-gray-700" /></button></div>{isLoading && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><Loader2 size={32} className="text-blue-600 animate-spin" /></div>}</div> : !isLoading ? <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400"><Camera size={48} strokeWidth={1} /><p className="text-sm text-gray-500">No {DRAWING_TYPES.find(dt => dt.key === activeDrawingType)?.label} yet</p><button onClick={handleGenerate} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"><Sparkles size={14} /> Generate {DRAWING_TYPES.find(dt => dt.key === activeDrawingType)?.label}</button></div> : null}</div>
    <p className="text-center text-[10px] text-gray-400 mt-2">PRELIMINARY DESIGN — VERIFY WITH LICENSED PROFESSIONAL BEFORE EXECUTION</p>
  </div>;
};
export default InteriorDrawings;
