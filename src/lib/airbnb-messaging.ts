export type AirbnbTemplateVariables = Record<string, string | number | null | undefined>;

export const renderAirbnbTemplate = (
  templateBody: string,
  variables: AirbnbTemplateVariables
): string => {
  return templateBody.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
};
