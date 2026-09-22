/**
 * Normalização e validação de CPF/CNPJ. Usado por contractingPartyService
 * (e pelo backfill de contratos) para garantir que
 * contracting_parties.document_number sempre guarda só dígitos, e que
 * o dígito verificador é real -- nunca uma sequência inválida ou
 * repetida (111.111.111-11 etc.), que os algoritmos oficiais sempre
 * rejeitam.
 */

function normalizeDocumentNumber(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function hasAllSameDigits(digits) {
  return /^(\d)\1+$/.test(digits);
}

function isValidCpf(rawValue) {
  const digits = normalizeDocumentNumber(rawValue);

  if (digits.length !== 11 || hasAllSameDigits(digits)) {
    return false;
  }

  const numbers = digits.split("").map(Number);

  const calculateCheckDigit = (length) => {
    let sum = 0;

    for (let i = 0; i < length; i += 1) {
      sum += numbers[i] * (length + 1 - i);
    }

    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateCheckDigit(9) === numbers[9] && calculateCheckDigit(10) === numbers[10]
  );
}

function isValidCnpj(rawValue) {
  const digits = normalizeDocumentNumber(rawValue);

  if (digits.length !== 14 || hasAllSameDigits(digits)) {
    return false;
  }

  const numbers = digits.split("").map(Number);

  const calculateCheckDigit = (length) => {
    const weights =
      length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;

    for (let i = 0; i < length; i += 1) {
      sum += numbers[i] * weights[i];
    }

    const remainder = sum % 11;

    return remainder < 2 ? 0 : 11 - remainder;
  };

  return (
    calculateCheckDigit(12) === numbers[12] && calculateCheckDigit(13) === numbers[13]
  );
}

module.exports = { normalizeDocumentNumber, isValidCpf, isValidCnpj };
