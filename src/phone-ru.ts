function digitsFromPhoneValue(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7") && digits.length > 0) digits = `7${digits}`;
  return digits.slice(0, 11);
}

function formatPhoneRu(digits: string) {
  const national = digits.startsWith("7") ? digits.slice(1, 11) : digits.slice(0, 10);
  let out = "+7";
  if (national.length === 0) return out;
  out += ` (${national.slice(0, 3)}`;
  if (national.length <= 3) return out;
  out += `) ${national.slice(3, 6)}`;
  if (national.length <= 6) return out;
  out += `-${national.slice(6, 8)}`;
  if (national.length <= 8) return out;
  out += `-${national.slice(8, 10)}`;
  return out;
}

export function isPhoneRuComplete(value: string) {
  const digits = digitsFromPhoneValue(value);
  return digits.length === 11 && digits.startsWith("7");
}

export function setPhoneValidity(input: HTMLInputElement) {
  if (isPhoneRuComplete(input.value)) input.setCustomValidity("");
  else input.setCustomValidity("Введите номер полностью: +7 (999) 999-99-99");
}

function bindPhoneInput(input: HTMLInputElement) {
  if (digitsFromPhoneValue(input.value).length <= 1) input.value = "+7";

  input.addEventListener("focus", () => {
    const end = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(end, end));
  });

  input.addEventListener("input", () => {
    const digits = digitsFromPhoneValue(input.value);
    input.value = digits.length <= 1 ? "+7" : formatPhoneRu(digits);
    if (isPhoneRuComplete(input.value)) input.setCustomValidity("");
    const end = input.value.length;
    input.setSelectionRange(end, end);
  });

  input.addEventListener("blur", () => {
    const digits = digitsFromPhoneValue(input.value);
    input.value = digits.length <= 1 ? "+7" : formatPhoneRu(digits);
    if (digits.length <= 1) input.setCustomValidity("");
    else setPhoneValidity(input);
  });
}

export function bindAllPhoneInputs(root: ParentNode) {
  for (const input of root.querySelectorAll<HTMLInputElement>("[data-phone-ru]")) {
    bindPhoneInput(input);
  }
}
