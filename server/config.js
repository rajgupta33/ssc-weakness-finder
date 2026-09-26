export const MODULES = [
  ["AP01", "Simple Tenses", "is/am/are + V3; was/were + V3", 3],
  [
    "AP02",
    "Continuous Passive",
    "is/am/are + being + V3; was/were + being + V3",
    3,
  ],
  ["AP03", "Perfect Passive", "has/have/had + been + V3", 3],
  ["AP04", "Future Passive", "will/shall + be + V3", 2],
  ["AP05", "Modal Passive", "modal + be + V3", 2],
  [
    "AP06",
    "Interrogative / WH Voice",
    "Preserve question structure while changing voice",
    3,
  ],
  [
    "AP07",
    "Imperative Voice",
    "Let + object + be + V3 or an accepted equivalent",
    2,
  ],
  [
    "AP08",
    "Special Structures",
    "Preserve meaning in double-object, infinitive and agent structures",
    2,
  ],
].map(([code, name, revision_text, count], index) => ({
  code,
  name,
  revision_text,
  count,
  display_order: index + 1,
}));

export const DIAGNOSTIC = {
  id: "active-passive-voice-20",
  title: "Active & Passive Voice",
  subject: "English",
  chapter: "Active & Passive Voice",
  question_count: 20,
};
