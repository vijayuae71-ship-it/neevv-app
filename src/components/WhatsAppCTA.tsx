'use client';

import React from 'react';
import { MessageCircle } from 'lucide-react';

const WHATSAPP_NUMBER = '919876543210'; // Replace with actual number

export const WhatsAppCTA: React.FC = () => {
  const handleClick = () => {
    const message = encodeURIComponent('Hi neevv team! I need help with my home design project.');
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
      title="Chat with us on WhatsApp"
    >
      <MessageCircle size={28} className="text-white" />
      <span className="absolute right-16 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
        Need help? Chat with us
      </span>
    </button>
  );
};
