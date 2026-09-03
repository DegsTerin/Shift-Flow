// en-GB: Keeps browser-side new-password validation aligned with bcrypt's byte boundary.
export const maximumNewPasswordUtf8Bytes = 72;

export function newPasswordUtf8ByteLength(password: string) {
  return new TextEncoder().encode(password).byteLength;
}

export function applyNewPasswordByteValidity(
  input: Pick<HTMLInputElement, "setCustomValidity" | "value">,
  message: string
) {
  input.setCustomValidity(
    newPasswordUtf8ByteLength(input.value) > maximumNewPasswordUtf8Bytes ? message : ""
  );
}
