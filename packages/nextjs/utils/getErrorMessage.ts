export const getErrorMessage = (e: unknown, fallback = "Something went wrong."): string => {
  return (e as any)?.shortMessage || (e instanceof Error ? e.message : fallback);
};
