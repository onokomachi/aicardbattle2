
import { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, writeBatch, doc, getFirestore } from 'firebase/firestore';
import { CardData } from './types';
import { CARD_DEFINITIONS } from './constants';

export const useCardData = (db: any) => {
  const [allCards, setAllCards] = useState<CardData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const cardCatalog = useMemo(() => {
    return allCards.reduce((acc, card) => {
      acc[card.definitionId] = card;
      return acc;
    }, {} as Record<number, CardData>);
  }, [allCards]);

  useEffect(() => {
    const fetchCards = async () => {
      if (!db) {
        setAllCards(CARD_DEFINITIONS);
        setIsLoading(false);
        return;
      }

      try {
        const cardsRef = collection(db, 'cards');
        const snapshot = await getDocs(cardsRef);

        if (snapshot.empty) {
          console.log("Centralized Fetch: Seeding Firestore with initial cards...");
          const batch = writeBatch(db);
          CARD_DEFINITIONS.forEach((card) => {
            const newCardRef = doc(cardsRef);
            batch.set(newCardRef, card);
          });
          await batch.commit();
          setAllCards(CARD_DEFINITIONS);
        } else {
          const fetchedCards: CardData[] = snapshot.docs.map(doc => doc.data() as CardData);
          fetchedCards.sort((a, b) => a.definitionId - b.definitionId);
          setAllCards(fetchedCards);
        }
      } catch (err) {
        console.error("Card Fetch Error:", err);
        setError(err as Error);
        setAllCards(CARD_DEFINITIONS); // Fallback to local
      } finally {
        setIsLoading(false);
      }
    };

    fetchCards();
  }, [db]);

  return { allCards, cardCatalog, isLoading, error };
};
