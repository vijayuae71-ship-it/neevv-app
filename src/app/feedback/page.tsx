'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db, ensureAuth } from '@/lib/firebase';
import { BRAND_LOGO_BASE64 } from '@/utils/brand';

type Profession = 'Contractor' | 'Interior Designer' | 'Architect' | 'Home Owner' | 'Other' | '';
type Price = 'Free only' | '₹499/month' | '₹999/month' | '₹1,999/month' | '';

export default function FeedbackPage() {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [profession, setProfession] = useState<Profession>('');
  const [otherProfession, setOtherProfession] = useState('');
  const [price, setPrice] = useState<Price>('');
  const [features, setFeatures] = useState('');
  const [contact, setContact] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating) {
      setError('Please choose a rating before submitting.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const user = await ensureAuth();
      const userId = user?.uid ?? auth.currentUser?.uid;
      if (!userId) throw new Error('Unable to establish an anonymous session.');
      await addDoc(collection(db, 'feedback'), {
        rating,
        profession: profession === 'Other' ? otherProfession.trim() || 'Other' : profession,
        price,
        features: features.trim(),
        contact: contact.trim(),
        userId,
        timestamp: serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setError('We couldn’t submit your feedback right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] px-4 py-10 sm:py-16">
        <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl bg-white px-6 py-12 text-center shadow-sm sm:px-10">
          <img src={BRAND_LOGO_BASE64} alt="neevv" className="mb-10 h-10 w-auto object-contain" />
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f0e8] text-3xl text-[#4f6f52]" aria-hidden="true">✓</div>
          <h1 className="text-2xl font-semibold text-gray-900">Thank you for your feedback!</h1>
          <p className="mt-3 text-gray-600">Your input helps us make neevv better for you.</p>
          <Link href="/" className="mt-8 rounded-lg bg-[#4f6f52] px-6 py-3 font-medium text-white transition hover:bg-[#405b43]">Try neevv</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg rounded-2xl bg-white px-5 py-7 shadow-sm sm:px-9 sm:py-9">
        <div className="mb-8 text-center">
          <img src={BRAND_LOGO_BASE64} alt="neevv" className="mx-auto mb-7 h-10 w-auto object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">We&apos;d love your feedback</h1>
          <p className="mt-2 text-sm text-gray-600">Help us build a better tool for you — takes 30 seconds</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-gray-800">How useful is neevv for your work? <span className="text-[#e8853d]">*</span></legend>
            <div className="flex gap-1" onMouseLeave={() => setHoveredRating(0)}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button key={star} type="button" aria-label={`${star} star${star === 1 ? '' : 's'}`} aria-pressed={rating === star} onClick={() => setRating(star)} onMouseEnter={() => setHoveredRating(star)} className={`rounded p-1 text-3xl leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-[#e8853d] ${(hoveredRating || rating) >= star ? 'text-[#e8853d]' : 'text-gray-300'}`}>★</button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="profession" className="mb-2 block text-sm font-medium text-gray-800">Your profession</label>
            <select id="profession" value={profession} onChange={(e) => setProfession(e.target.value as Profession)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-gray-900 outline-none transition focus:border-[#4f6f52] focus:ring-2 focus:ring-[#4f6f52]/20">
              <option value="">Select your profession</option>
              <option>Contractor</option><option>Interior Designer</option><option>Architect</option><option>Home Owner</option><option>Other</option>
            </select>
            {profession === 'Other' && <input value={otherProfession} onChange={(e) => setOtherProfession(e.target.value)} placeholder="Tell us your profession" className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none focus:border-[#4f6f52] focus:ring-2 focus:ring-[#4f6f52]/20" />}
          </div>

          <fieldset>
            <legend className="mb-3 block text-sm font-medium text-gray-800">What would you pay monthly?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['Free only', '₹499/month', '₹999/month', '₹1,999/month'] as Price[]).map((option) => <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-3 text-sm text-gray-700 hover:border-[#4f6f52]"><input type="radio" name="price" value={option} checked={price === option} onChange={() => setPrice(option)} className="accent-[#4f6f52]" />{option}</label>)}
            </div>
          </fieldset>

          <div><label htmlFor="features" className="mb-2 block text-sm font-medium text-gray-800">What features would you like to see?</label><textarea id="features" rows={3} value={features} onChange={(e) => setFeatures(e.target.value)} className="w-full resize-none rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none focus:border-[#4f6f52] focus:ring-2 focus:ring-[#4f6f52]/20" /></div>
          <div><label htmlFor="contact" className="mb-2 block text-sm font-medium text-gray-800">Your contact info for follow-up <span className="font-normal text-gray-500">(optional)</span></label><input id="contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Email or phone number" className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none focus:border-[#4f6f52] focus:ring-2 focus:ring-[#4f6f52]/20" /></div>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-[#4f6f52] px-4 py-3 font-medium text-white transition hover:bg-[#405b43] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Submitting…' : 'Submit feedback'}</button>
        </form>
      </div>
    </main>
  );
}
