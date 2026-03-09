// scoring.js - Score calculation utilities

export const SECTION_WEIGHTS = {
  photo: 0.5,
  title: 1.0,
  overview: 2.0,
  portfolio: 1.5,
  skills: 1.0,
  workHistory: 1.5,
  rates: 0.5,
  compliance: 1.0
};

export const TOTAL_MAX_POINTS = Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0); // 9.0

export function calculateOverallScore(sections) {
  const totalEarned = sections.reduce((sum, s) => sum + (s.earnedPoints || 0), 0);
  return (totalEarned / TOTAL_MAX_POINTS) * 10;
}

export function getCategory(score) {
  if (score <= 3) return { label: 'Critical', description: 'Immediate attention required across multiple sections' };
  if (score <= 6) return { label: 'Good', description: 'Solid foundation with significant room for improvement' };
  if (score <= 8) return { label: 'Excellent', description: 'Strong profile with minor optimizations needed' };
  return { label: 'Elite', description: 'Outstanding profile — you\'re among the top freelancers' };
}

export function getScoreColor(score) {
  if (score <= 3) return '#ef4444';
  if (score <= 6) return '#f59e0b';
  if (score <= 8) return '#31b3e5';
  return '#8b5cf6';
}
