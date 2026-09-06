# neevv Standards Reference

## Purpose
This document lists every hardcoded engineering, architectural, MEP, dimensional, and construction-specification value in the neevv system for expert review. These values are **defaults for preliminary visualisation only**; they are not a project-specific design or approval set.

## How to use this document
A licensed architect / structural engineer / MEP consultant should review each value and confirm or correct it. Mark each row ✅ or ❌. Where a standard is cited, the standard governs the design/check; it does **not** necessarily prescribe the displayed value. Local development-control regulations, soil investigation, occupancy, fire requirements, vendor data and coordinated services take precedence.

## 1. Structural Defaults
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Column count heuristic | max(6, ceil(built-up area / 12 m²)) | No code basis; preliminary software heuristic — engineer design required | `textOverlay.ts` | 50–55 |
| Front/rear/side setbacks | Front 1.5 m; rear 1.5 m; left/right 1.0 m | NBC 2016 / applicable local development-control regulations; plot-specific verification required | `textOverlay.ts` | 69–71 |
| Column main reinforcement | 4 nos. 12 mm Fe500 | IS 456:2000; IS 1786 (Fe500 reinforcement); IS 13920 where ductile detailing applies | `textOverlay.ts` | 98–101 |
| Column stirrups | 8 mm @ 150 mm c/c | IS 456:2000; IS 13920 for seismic confinement zones | `textOverlay.ts` | 99–101 |
| Column clear cover | 40 mm | IS 456:2000, Cl. 26.4 (exposure/member-specific) | `textOverlay.ts` | 100 |
| Column concrete | M25 | IS 456:2000; project durability/exposure design | `textOverlay.ts` | 107–110 |
| Slab thickness | 125 mm | IS 456:2000; span/deflection/fire/design-load check required | `textOverlay.ts` | 123–126 |
| Beam size | 230 × 400 mm | IS 456:2000; IS 13920 and IS 1893:2016 where seismic design applies | `textOverlay.ts` | 125 |
| RCC material grade | M25 concrete / Fe500 steel | IS 456:2000; IS 1786 | `textOverlay.ts` | 138–141 |
| BBS steel allowance | 4.50 kg/sqft | Industry estimating assumption; final BBS to IS 2502 and structural design | `textOverlay.ts` | 159–164 |
| BBS allocation factors | Foundation 80, columns 120, beams 100, slabs 60 kg per m³ concrete | Industry estimating assumption; not a codal reinforcement ratio | `textOverlay.ts` | 168–173 |
| Footing type | Isolated footing | IS 456:2000; IS 1904; soil report/geotechnical engineer | `textOverlay.ts` | 186–191 |
| Footing | 1200 × 1200 × 300 mm | IS 456:2000; IS 1904; design for SBC/load/punching/shear | `textOverlay.ts` | 188, 236 |
| PCC bed | 1350 × 1350 × 150 mm, M10 | IS 456:2000 / IS 1904; project specification | `textOverlay.ts` | 189, 237 |
| Foundation depth | 1.50 m below ground level | IS 1904; local frost/scour/soil conditions and geotechnical design | `textOverlay.ts` | 190, 245, 241 |
| Assumed SBC | 150 kN/m² | IS 6403 / geotechnical investigation; must not be used without site report | `textOverlay.ts` | 191, 252 |
| Excavation working space | 150 mm each side | Industry construction practice; method/site-dependent | `textOverlay.ts` | 246 |
| Footing reinforcement | 12 mm @ 150 mm c/c both ways | IS 456:2000; structural engineer design | `textOverlay.ts` | 238 |
| Foundation clear cover | 50 mm | IS 456:2000, Cl. 26.4; exposure/casting against earth to be checked | `textOverlay.ts` | 239 |
| Pedestal | 300 × 450 mm | IS 456:2000; structural design required | `textOverlay.ts` | 248 |
| Footing dowels | 4–12 mm | IS 456:2000; IS 13920 where applicable | `textOverlay.ts` | 249 |
| Lap length | 50d = 600 mm | IS 456:2000 development/splice length calculation; IS 13920 seismic restrictions where applicable | `textOverlay.ts` | 250, 267 |
| Beam longitudinal bars | Top 2–12 mm continuous; bottom 2–16 mm at mid-span | IS 456:2000; IS 13920 where applicable | `textOverlay.ts` | 273–274 |
| Beam stirrups | 8 mm @ 150 mm c/c near support; 200 mm c/c midspan | IS 456:2000; IS 13920 where applicable | `textOverlay.ts` | 275 |
| Slab reinforcement | 10 mm @ 150 mm c/c main; 8 mm @ 200 mm c/c distribution | IS 456:2000 | `textOverlay.ts` | 281–283 |
| Slab clear cover | 20 mm | IS 456:2000, Cl. 26.4 (subject to exposure) | `textOverlay.ts` | 283 |
| Plinth / storey / parapet | 450 mm / 3000 mm / 900 mm | NBC 2016; local bye-laws and coordinated architectural/structural design | `textOverlay.ts` | 301–306 |
| Total height formula | 450 + floors × 3000 + 900 mm | Software heuristic; NBC/local height limits apply | `textOverlay.ts` | 293–305, 327–338 |
| External/internal wall | 230 mm / 150 mm (section); masonry internal 115 mm | IS 1905; NBC 2016; structural/acoustic/fire requirements | `textOverlay.ts` | 311–315, 355–357 |
| Plaster | 12 mm each side; internal 12 mm, external 20 mm | IS 1661 / project specification; substrate and finish-specific | `textOverlay.ts` | 314, 361 |
| Window sill / lintel levels | 900 mm / 2100 mm from FFL | NBC 2016 / architectural coordination; accessibility and facade design | `textOverlay.ts` | 342–343 |
| Stair floor height/riser/tread | 3000 mm; 175 mm riser (max text: 190 mm); 250 mm tread (min) | NBC 2016 stair provisions; occupancy/fire/egress-specific review | `textOverlay.ts` | 433–446 |
| Stair width / waist / landing / handrail | 1000 mm clear (text: min 900); 150 mm RCC; 125 mm RCC; handrail 1000 mm | NBC 2016; IS 456:2000 for RCC; accessibility/fire provisions | `textOverlay.ts` | 444–453 |
| UGT / OHT / pump | 5000 L UGT; 200 mm M25 walls/base; 2000 L OHT; 0.5 HP pump | IS 3370 (water-retaining RCC); IS 1172:1993 demand; manufacturer pump selection | `textOverlay.ts` | 467–479 |
| Roof waterproofing | 3 mm APP membrane; 50 mm M15 sloped screed | IS 1346 / manufacturer system specification; drainage and warranty design | `textOverlay.ts` | 494–507 |
| DPC | 50 mm, 1:2:4 cement concrete | IS 3067 / project specification | `textOverlay.ts` | 498 |
| Septic tank / soak pit | 2000 L; 1500 × 750 × 1500 mm; 230 mm brick wall; 100 mm RCC cover; 900 mm dia; 1500 mm depth; min. 3 m building separation | IS 2470 Parts 1–2; IS 1172:1993; local sanitation authority requirements | `textOverlay.ts` | 520–538 |

## 2. Interior — Kitchen
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Compact-kitchen threshold / layout logic | under 55 sqft; U-shape at width ≥ 8 ft, otherwise L-shape | Industry Standard Practice; final ergonomic layout review | `buildInteriorScene.ts` | 271–277 |
| Base/upper cabinets | 3000 W × 600 D × 850 H mm; 3000 W × 350 D × 750 H mm | IS 3457 / Industry Standard Practice; manufacturer module system | `buildInteriorScene.ts` | 280–299 |
| Tall pantry | 600 × 600 × 2100 mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 301–309 |
| Quartz counter | 3000 × 600 × 20 mm; counter top 850 mm | IS 3457 / manufacturer standard | `buildInteriorScene.ts` | 313–321, 414 |
| Backsplash / upper cabinet bottom | 600 mm high; 870 mm start; cabinet bottom 1450 mm | IS 3457 / Industry Standard Practice | `buildInteriorScene.ts` | 323–331, 415 |
| Chimney / hob / sink | 600 × 450 × 500 mm at 1450 mm; 600 × 500 × 50 mm at 850 mm; 600 × 450 × 250 mm, mount 600 mm | Manufacturer Standard; IS 3457 ergonomic coordination | `buildInteriorScene.ts` | 333–361 |
| Under-cabinet LED / kick plinth | 3000 × 20 × 20 mm at 1450 mm; 3000 × 20 × 100 mm | IS 732:1989 for electrical installation; manufacturer standard | `buildInteriorScene.ts` | 363–379 |
| Kitchen openings | 900 × 2100 mm door; 1200 × 900 mm window; window sill 1050 mm | NBC 2016 / architectural coordination | `buildInteriorScene.ts` | 382–399 |
| Kitchen circulation | 3'-6" compact / 4'-0" standard clear path | Industry Standard Practice | `buildInteriorScene.ts` | 407 |
| Kitchen tiles / lighting | 600 × 600 mm floor tile; 3000 K LED; 3 downlights | Manufacturer Standard / IS 732:1989 | `buildInteriorScene.ts` | 424–431 |

## 3. Interior — Bathroom
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Compact bathroom threshold | under 40 sqft | Industry Standard Practice | `buildInteriorScene.ts` | 91–92 |
| EWC | 380 × 560 mm; 400 mm mount height compact or 750 mm fixture height standard | IS 1172:1993; manufacturer standard; accessibility review | `buildInteriorScene.ts` | 95–108 |
| Basin / vanity | 450 × 350 mm compact or 600 × 450 mm standard; 800 mm mounting level | IS 1172:1993 / manufacturer standard | `buildInteriorScene.ts` | 110–121 |
| Shower enclosure | 700 × 700 mm compact or 900 × 900 mm standard; 2000 mm high | IS 1172:1993 / manufacturer standard | `buildInteriorScene.ts` | 123–134 |
| Health faucet / towel rail / mirror | 100 × 100 × 300 at 600 mm; 600 × 60 × 60 at 1500 mm; 600 × 30 × 700 at 1050 mm | Manufacturer Standard / ergonomic practice | `buildInteriorScene.ts` | 136–165 |
| Niche / floor trap | 300 × 300 compact or 400 × 300 standard at 1200 mm; 150 × 150 mm floor trap | IS 1172:1993; IS 1742 (sanitary appliances); manufacturer standard | `buildInteriorScene.ts` | 167–190 |
| Bathroom door/window | 750 × 2100 mm outward door; 600 × 450 mm window, 2100 mm sill | NBC 2016 / privacy, ventilation, architectural coordination | `buildInteriorScene.ts` | 194–210 |
| Wet-area circulation and slope | 2'-0" compact / 2'-6" standard; slope 1:40 | IS 1172:1993 / good drainage practice | `buildInteriorScene.ts` | 216–218, 246 |
| Bathroom tiles / dado / lighting | 300 × 300 anti-skid; dado 2100 mm; 3000 K; 2 IP65 downlights; exhaust at 2400 mm | IS 732:1989; IS 1172:1993; manufacturer standard | `buildInteriorScene.ts` | 229–251 |

## 4. Interior — Bedroom
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Beds | Master king 1800 × 2000 × 450 mm; other queen 1500 × 2000 × 450 mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 447–456 |
| Side tables | Master: 2 × 500 × 400 × 500 mm; other: 450 × 400 × 500 mm | Industry Standard Practice | `buildInteriorScene.ts` | 461–467 |
| Wardrobe | Master 2400 W; other 1800 W; both 600 D × 2400 H mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 443, 470–479 |
| Dressing / TV / study | 1200 × 450 × 750; 1500 × 400 × 450; 1200 × 600 × 750 mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 482–489 |
| Split AC | 900 × 250 × 300 mm at 2400 mm | Manufacturer Standard; IS 732:1989 circuit/isolator design | `buildInteriorScene.ts` | 493–502 |
| Bedroom door/window | 900 × 2100 mm door; master 1500 × 1200, other 1200 × 1200 mm windows; 900 mm sill | NBC 2016 / architectural coordination | `buildInteriorScene.ts` | 506–512 |
| Clearances / lighting | 2'-6" around bed; 750 mm dressing side; 2700 K; 2/1 bedside lamps and 2 downlights | Industry Standard Practice; IS 732:1989 | `buildInteriorScene.ts` | 518–543 |

## 5. Interior — Living Room
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| L-sofa / centre table | 2700 × 1800 × 850 mm; 1200 × 600 × 400 mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 550–552 |
| TV, display and console units | TV unit 2100 × 400 × 450; bookshelf 900 × 300 × 1800; console 1200 × 350 × 850 mm | Industry Standard Practice / manufacturer standard | `buildInteriorScene.ts` | 553–555 |
| TV / AC | 55 in TV, 1230 × 60 × 710 mm at 900 mm; AC 900 × 250 × 300 mm at 2400 mm | Manufacturer Standard; IS 732:1989 | `buildInteriorScene.ts` | 559–578 |
| Living openings / circulation | 1000 × 2100 mm door; 1800 × 1200 mm window, 900 mm sill; 3'-0" path | NBC 2016 / Industry Standard Practice | `buildInteriorScene.ts` | 582–592 |
| Lighting | 3000 K cove LED; 4 downlights | IS 732:1989 / manufacturer standard | `buildInteriorScene.ts` | 610–613 |

## 6. Electrical Specifications
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Concealed wiring / conduit | Copper FR-LSH; 25 mm PVC concealed conduit | IS 732:1989; IS 694 for PVC insulated cables; local electrical rules | `textOverlay.ts` | 374–389 |
| Protective devices | 32 A power MCB; 16 A light MCB; 63 A, 30 mA ELCB | IS 732:1989; IS/IEC 60898 and IS/IEC 61008/61009; load/discrimination calculation required | `textOverlay.ts` | 384–388 |
| Earthing | Pipe + plate earthing | IS 3043 | `textOverlay.ts` | 379 |
| Interior default point schedule | 2 switches, 3 sockets, 1 data, 2 lights, 1 fan, 0 AC points | IS 732:1989; final load/room/use coordination required | `buildInteriorScene.ts` | 679–687 |
| Drawing placement limits | max 4 switches/sockets, 6 lights, 2 fan/AC/data points; light grid max 3 columns | Software drawing convention, not a code requirement | `InteriorDrawings.tsx` | 826–858 |
| Electrical graphic positions | DB bottom-left; switches at door-side; sockets on walls | Software drawing convention; final coordinated electrical layout required | `InteriorDrawings.tsx` | 823–873 |

## 7. General Building Parameters
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Clear height / false-ceiling level / wall thickness | 3050 mm / 2750 mm / 230 mm | NBC 2016; IS 1905 for masonry; local bye-laws / project design | `buildInteriorScene.ts` | 22–24, 654–669 |
| Default generic door/window | 900 × 2100 mm inward door; 1200 × 1200 mm window with 900 mm sill | NBC 2016 / architectural coordination | `buildInteriorScene.ts` | 628–630 |
| Interior drawing scale / wall thickness | 1 m = 50 px; 0.23 m = 230 mm | Drawing convention; wall thickness subject to IS 1905/project design | `InteriorDrawings.tsx` | 7–10 |
| Drawn plan doors | 900 mm; toilet left-wall, kitchen bottom-wall, default bottom-wall; generic 20% wall position | Drawing convention / architectural coordination | `InteriorDrawings.tsx` | 68, 140–170 |
| Drawn plan windows | Toilet 600 mm; kitchen 900 mm; living/dining 1500 mm; bedroom 1200 mm | NBC 2016 / architectural coordination | `InteriorDrawings.tsx` | 177–195 |
| Furniture-plan clearance | 600 mm | Industry Standard Practice; circulation to be verified for use/accessibility | `InteriorDrawings.tsx` | 278 |
| Ceiling defaults shown | Plain 2.9 m; peripheral/full drop 225 mm; section slab graphic 6 px and drop 20 px | Industry Standard Practice / manufacturer false-ceiling system; structural slab depth not represented | `InteriorDrawings.tsx` | 685–736, 757–789 |
| Flooring shown | Default 600 × 600 mm; toilet 300 × 300 mm | Manufacturer Standard / tile-layout coordination | `InteriorDrawings.tsx` | 1198–1242 |
| Woodwork drawing module graphics | Wardrobe 220 × 160 px; kitchen 240 × 150 px; TV/study 200/180 × 100 px; puja 120 × 130 px; generic 160 × 100 px | Drawing graphic only, not a construction dimension | `InteriorDrawings.tsx` | 982–1131 |

## 8. NBC Compliance Values
| Parameter | Value | Source Standard | File | Line |
|---|---:|---|---|---:|
| Setback display | F 1.5 m, R 1.5 m, L 1.0 m, R 1.0 m | NBC 2016 plus governing local development-control regulations; must be plot/authority specific | `textOverlay.ts` | 69–71 |
| Stair limits shown | Riser 175 mm (label says maximum 190 mm); tread 250 mm (label says minimum 250 mm); width 1000 mm (label says minimum 900 mm) | NBC 2016; fire/occupancy/accessibility provisions and local bye-laws to govern | `textOverlay.ts` | 433–446 |
| Height values shown | 450 mm plinth, 3000 mm floor-to-floor, 900 mm parapet | NBC 2016 / local bye-laws; no universal approval presumption | `textOverlay.ts` | 301–306, 332–338 |
| Door/window dimensions shown | Doors 750/900/1000 × 2100 mm; windows 600/900/1200/1500/1800 wide, 450/900/1200 high; sill 900/1050/2100 mm | NBC 2016; fire, ventilation, accessibility and local bye-laws to govern | `buildInteriorScene.ts`; `InteriorDrawings.tsx` | 194–210, 382–399, 506–512, 582–592; 140–195 |
| Coverage tiers | Not present in the reviewed files | N/A — confirm against NBC 2016 and local regulations elsewhere in the application | Reviewed files | N/A |

## Review note
This inventory covers hardcoded construction-relevant values in the three reviewed source files. Non-engineering rendering values (SVG stroke widths, fonts, colours, pixel offsets, animation/UI sizing) were intentionally not treated as design standards. All quantified defaults need project-specific sign-off before issue for construction.
