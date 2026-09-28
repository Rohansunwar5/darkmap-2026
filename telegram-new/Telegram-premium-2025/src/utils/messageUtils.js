export const calculateScore = (text, keywords) => {
    let score = 0;
    keywords.forEach((keyword) => {
      if (text.toLowerCase().includes(keyword.toLowerCase())) {
        score++;
      }
    });
    return score;
  };
  
  export const filterAndPrioritizeMessages = (messages, keywords) => {
    if (!Array.isArray(messages)) {
      return [];
    }
  
    if (!keywords || keywords.length === 0) return messages;
  
    const prioritizedMessages = messages
      .map((message) => ({
        ...message,
        score: calculateScore(message.text, keywords),
      }))
      .sort((a, b) => b.score - a.score);
  
    const highScoreMessages = prioritizedMessages.filter((msg) => msg.score >= 2);
    const lowScoreMessages = prioritizedMessages.filter((msg) => msg.score < 2);
  
    highScoreMessages.sort((a, b) => new Date(b.date) - new Date(a.date));
    lowScoreMessages.sort((a, b) => new Date(b.date) - new Date(a.date));
  
    return [...highScoreMessages, ...lowScoreMessages];
  };