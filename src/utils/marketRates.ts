/**
 * Indicative construction rate adjustments by city and specification level.
 *
 * Base rates in boqCalculator.ts are composite (material + labour) "standard specification"
 * rates for a reference Indian city. These factors scale them. They are indicative market
 * levels, not quotations — the Rates step lets the customer enter local contractor rates.
 */
import type { BudgetRange } from '../types';

const CITY_FACTORS: { match: RegExp; factor: number; label: string }[] = [
  { match: /mumbai|thane|navi mumbai/i, factor: 1.3, label: 'Mumbai metropolitan' },
  { match: /delhi|gurgaon|gurugram|noida|ghaziabad|faridabad/i, factor: 1.12, label: 'Delhi NCR' },
  { match: /bangalore|bengaluru/i, factor: 1.1, label: 'Bengaluru' },
  { match: /pune/i, factor: 1.1, label: 'Pune' },
  { match: /hyderabad|secunderabad/i, factor: 1.05, label: 'Hyderabad' },
  { match: /chennai/i, factor: 1.05, label: 'Chennai' },
  { match: /kochi|cochin|ernakulam|trivandrum|thiruvananthapuram|calicut|kozhikode/i, factor: 1.05, label: 'Kerala city' },
  { match: /goa|panaji|margao/i, factor: 1.08, label: 'Goa' },
  { match: /ahmedabad|surat|vadodara|kolkata|howrah|chandigarh|mohali/i, factor: 1.0, label: 'Large city' },
  { match: /jaipur|lucknow|indore|bhopal|nagpur|coimbatore|mysore|mysuru|visakhapatnam|vizag|vijayawada|madurai|nashik|bhubaneswar|patna|ranchi|dehradun|raipur|guwahati|mangalore|mangaluru|hubli|belgaum|belagavi/i, factor: 0.95, label: 'Tier-2 city' },
];
const DEFAULT_CITY = { factor: 0.92, label: 'Other city / town' };

export function cityRateFactor(city?: string): { factor: number; label: string } {
  if (!city) return { factor: 1.0, label: 'Reference city' };
  const hit = CITY_FACTORS.find((c) => c.match.test(city));
  return hit ? { factor: hit.factor, label: hit.label } : DEFAULT_CITY;
}

/** Specification level — applies to finishes, doors/windows and (half-weight) fixtures; structure is unchanged. */
export function specFactor(budget?: BudgetRange): { factor: number; label: string } {
  switch (budget) {
    case 'economy': return { factor: 0.8, label: 'Economy finishes' };
    case 'premium': return { factor: 1.35, label: 'Premium finishes' };
    case 'luxury': return { factor: 1.8, label: 'Luxury finishes' };
    default: return { factor: 1.0, label: 'Standard finishes' };
  }
}
