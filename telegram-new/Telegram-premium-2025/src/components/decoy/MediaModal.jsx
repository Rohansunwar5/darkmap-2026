import React from 'react';
import { createPortal } from 'react-dom';

const MediaModal = ({ isOpen, onClose, mediaUrl, mediaKind }) => {
  if (!isOpen) return null;



  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-black/90 flex flex-col items-center justify-center backdrop-blur-sm">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent z-[100000]">
        <button 
          onClick={onClose}
          className="p-2 rounded-full bg-black/50 hover:bg-black/80 text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="w-full h-full flex items-center justify-center p-8 mt-12" onClick={onClose}>
        <div className="max-w-5xl max-h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          {(!mediaKind || mediaKind === 'photo' || mediaKind === 'sticker' || mediaKind === 'gif') && (
            <img 
              src={mediaUrl} 
              alt="Media Fullscreen" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" 
            />
          )}
          {mediaKind === 'video' && (
            <video 
              src={mediaUrl} 
              controls 
              autoPlay 
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl" 
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default MediaModal;
