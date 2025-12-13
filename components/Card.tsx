
import React, { useState } from 'react';
import type { BattleOutcome, CardData } from '../types';
import { AttackIcon, DefenseIcon } from './Icons';

// Responsive size definitions
// Mobile: w-20 h-28 (Smallest)
// Small Tablet: w-24 h-36
// Tablet/Laptop: w-32 h-48
// Desktop: w-40 h-60
// Large Desktop: w-48 h-72
const CARD_SIZE_CLASSES = "w-20 h-28 xs:w-24 xs:h-36 sm:w-32 sm:h-48 md:w-36 md:h-52 lg:w-40 lg:h-60 2xl:w-48 2xl:h-72";
const CARD_TEXT_CLASSES = "text-[10px] sm:text-xs lg:text-sm";
const ICON_SIZE_CLASSES = "w-3 h-3 sm:w-4 sm:h-4";

interface CardProps {
  card: CardData;
  onClick?: () => void;
  isPlayable?: boolean;
  inHand?: boolean;
  isSelected?: boolean;
  isCastingEffect?: boolean;
  isBattling?: boolean;
  battleOutcome?: BattleOutcome;
  owner?: 'player' | 'pc';
  className?: string; // Allow overriding dimensions if needed
}

const Card: React.FC<CardProps> = ({ 
  card, 
  onClick, 
  isPlayable = false, 
  inHand = false,
  isSelected = false,
  isCastingEffect = false,
  isBattling = false,
  battleOutcome = null,
  owner = 'player',
  className
}) => {
  const [imageError, setImageError] = useState(false);
  
  const isExternalOrData = card.image.startsWith('http') || card.image.startsWith('data:');
  const imageUrl = isExternalOrData ? card.image : `/Image2/${card.image}`;

  const handleImageError = () => {
    setImageError(true);
  };

  const attributeStyles = {
    passion: 'border-red-500 hover:shadow-red-500/50',
    calm: 'border-blue-500 hover:shadow-blue-500/50',
    harmony: 'border-green-500 hover:shadow-green-500/50',
  };

  let battleAnimationClass = '';
  if (isBattling) {
    if (battleOutcome === 'win') {
      battleAnimationClass = owner === 'player' ? 'animate-attack-win-player' : 'animate-attack-win-pc';
    } else if (battleOutcome === 'lose') {
      battleAnimationClass = 'animate-lose-battle';
    } else if (battleOutcome === 'draw') {
      battleAnimationClass = 'animate-shake';
    }
  }

  // Use provided className or default responsive sizes
  const sizeClasses = className || CARD_SIZE_CLASSES;

  const cardClasses = `
    ${sizeClasses}
    bg-gray-800 border-2 rounded-lg shadow-lg flex flex-col justify-between p-1 sm:p-2 transition-all duration-300 transform relative
    ${attributeStyles[card.attribute]}
    ${isPlayable ? 'cursor-pointer hover:shadow-amber-400/50' : ''}
    ${isSelected ? 'scale-125 -translate-y-4 sm:-translate-y-8 z-50 shadow-amber-400/50' : inHand ? 'hover:scale-125 hover:-translate-y-4 sm:hover:-translate-y-8 hover:z-50' : ''}
    ${isCastingEffect ? 'animate-glow-gold z-10' : ''}
    ${battleAnimationClass}
  `;

  return (
    <div className={cardClasses} onClick={isPlayable ? onClick : undefined}>
      {card.level && card.level > 1 && (
        <div className="absolute top-0 right-0 sm:top-1 sm:right-1 bg-gradient-to-br from-yellow-400 to-amber-600 text-white text-[8px] sm:text-xs font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-white/50 z-10" style={{ textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}>
          Lv.{card.level}
        </div>
      )}
      <div className={`text-center text-white font-bold truncate ${CARD_TEXT_CLASSES}`}>{card.name}</div>
      <div className="flex-grow my-0.5 sm:my-1 bg-gray-900 rounded-sm sm:rounded-md flex items-center justify-center overflow-hidden relative group">
        {imageError ? (
          <div className="flex flex-col items-center justify-center w-full h-full bg-gray-800 text-gray-500">
             <svg className="w-8 h-8 sm:w-12 sm:h-12 opacity-50 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
             </svg>
             <span className="text-[8px] sm:text-[10px]">No Image</span>
          </div>
        ) : (
          <img 
            src={imageUrl} 
            alt={card.name} 
            className="w-full h-full object-cover" 
            onError={handleImageError} 
          />
        )}
      </div>
       <div className="h-8 sm:h-12 flex items-center justify-center p-0.5">
        <p className={`text-gray-300 text-center italic leading-tight line-clamp-3 ${CARD_TEXT_CLASSES} opacity-90 scale-90 sm:scale-100 origin-center`}>{card.description}</p>
      </div>
      <div className="flex justify-around items-center text-white">
        <div className="flex items-center space-x-0.5 sm:space-x-1 bg-red-500/50 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full">
          <AttackIcon className={ICON_SIZE_CLASSES} />
          <span className={`font-bold ${CARD_TEXT_CLASSES}`}>{card.attack}</span>
        </div>
        <div className="flex items-center space-x-0.5 sm:space-x-1 bg-blue-500/50 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full">
          <DefenseIcon className={ICON_SIZE_CLASSES} />
          <span className={`font-bold ${CARD_TEXT_CLASSES}`}>{card.defense}</span>
        </div>
      </div>
    </div>
  );
};

export const CardBack: React.FC<{ className?: string }> = ({ className }) => {
  const [imageError, setImageError] = useState(false);
  const imageUrl = `/Image2/11.jpg`;

  const handleError = () => {
    setImageError(true);
  };
  
  const sizeClasses = className || CARD_SIZE_CLASSES;
  
  return (
    <div className={`${sizeClasses} bg-gray-800 border-2 border-purple-500 rounded-lg shadow-lg flex items-center justify-center p-1 overflow-hidden`}>
       {imageError ? (
         <div className="w-full h-full border-2 border-purple-400/50 bg-gray-800 rounded-md flex items-center justify-center">
            <div className="text-purple-500 font-bold text-lg sm:text-2xl opacity-50 text-center leading-tight">AI<br/>CARD</div>
         </div>
       ) : (
         <img src={imageUrl} alt="Card Back" className="w-full h-full object-cover rounded-md" onError={handleError} />
       )}
    </div>
  );
}

export default Card;
