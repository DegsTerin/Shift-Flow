// en-GB: Selects the newest independently published UI error without mutating lane state.
export type UiError = { order: number; message: string };

export function mostRecentUiError(...errors: Array<UiError | null | undefined>) {
  return errors.reduce<UiError | undefined>((latest, candidate) => {
    if (!candidate) return latest;
    return !latest || candidate.order > latest.order ? candidate : latest;
  }, undefined);
}
