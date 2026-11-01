import { useState, useEffect, useRef } from "react";

export function useTypewriter(
  fullText: string,
  messageId: string,
  isAlreadyCompleted: boolean,
  onComplete: () => void,
  onProgress?: () => void
) {
  const [displayedText, setDisplayedText] = useState(
    isAlreadyCompleted ? fullText : ""
  );
  const [isTyping, setIsTyping] = useState(!isAlreadyCompleted);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isAlreadyCompleted) {
      setDisplayedText(fullText);
      setIsTyping(false);
      return;
    }

    let currentIndex = 0;
    const totalLength = fullText.length;

    // Dynamically adjust chunk size so animation completes comfortably in 2 to 3.5 seconds
    const chunkSize = Math.max(
      4,
      Math.min(35, Math.ceil(totalLength / 120))
    );
    const tickInterval = 18; // ms

    setIsTyping(true);

    timerRef.current = window.setInterval(() => {
      currentIndex += chunkSize;
      if (currentIndex >= totalLength) {
        setDisplayedText(fullText);
        setIsTyping(false);
        if (timerRef.current) clearInterval(timerRef.current);
        onComplete();
      } else {
        setDisplayedText(fullText.slice(0, currentIndex));
        onProgress?.();
      }
    }, tickInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [messageId, isAlreadyCompleted, fullText]);

  const skip = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setDisplayedText(fullText);
    setIsTyping(false);
    onComplete();
  };

  return { displayedText, isTyping, skip };
}
