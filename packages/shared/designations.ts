export const loginDesignations = [
  "Member Secretary",
  "Adviser-I",
  "Adviser-II",
  "Director",
  "Deputy Director",
  "Assistant Director",
  "Regional Officer",
  "Supporting Official",
  "Technical Official",
  "Other",
  "Test Official",
  "Test Manager",
];
export function designationMatches(saved: string, selected: string) {
  const actual = saved.trim().toLowerCase(),
    choice = selected.trim().toLowerCase();
  return (
    actual === choice ||
    (choice === "other" &&
      !loginDesignations.some((value) => value.toLowerCase() === actual))
  );
}
