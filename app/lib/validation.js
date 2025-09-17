// app/lib/validation.js

/**
 * Validates UK VAT registration number (VRN)
 * Implements checksum validation using modulus 97 algorithm
 * @param {string} vrn - The VRN to validate
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validateVrn(vrn) {
  if (!vrn) {
    return { isValid: false, message: "VRN is required" };
  }

  const vrnString = String(vrn).replace(/\s/g, ""); // Remove spaces
  
  // Check basic format - 9 digits
  if (!/^\d{9}$/.test(vrnString)) {
    return { 
      isValid: false, 
      message: "VRN must be exactly 9 digits (e.g., 193054661)" 
    };
  }

  // Perform modulus 97 checksum validation for UK VAT numbers
  // Algorithm: Take first 7 digits, multiply by 100, add last 2 digits, result should be divisible by 97
  const first7Digits = vrnString.slice(0, 7);
  const last2Digits = vrnString.slice(7, 9);
  
  // Special case: reject all zeros as it's not a real VRN
  if (vrnString === "000000000") {
    return { 
      isValid: false, 
      message: "VRN cannot be all zeros" 
    };
  }
  
  const calculationValue = (parseInt(first7Digits) * 100) + parseInt(last2Digits);
  
  if (calculationValue % 97 !== 0) {
    return { 
      isValid: false, 
      message: "VRN checksum validation failed - please verify the number is correct" 
    };
  }

  return { isValid: true, message: "Valid VRN" };
}

/**
 * Validates VAT period key format
 * Supports formats like: 24A1, 24A2, 24A3, 24A4 (quarterly) or 24AA (annual)
 * @param {string} periodKey - The period key to validate
 * @returns {object} - {isValid: boolean, message: string}
 */
export function validatePeriodKey(periodKey) {
  if (!periodKey) {
    return { isValid: false, message: "Period key is required" };
  }

  const periodKeyString = String(periodKey).trim().toUpperCase();
  
  // Check basic format: 2 digits + 1-2 letters + optional 1 digit/letter
  if (!/^[0-9]{2}[A-Z]{1,2}[0-9A-Z]?$/.test(periodKeyString)) {
    return { 
      isValid: false, 
      message: "Period key must be in format like 24A1, 24A2, 24A3, 24A4, or 24AA" 
    };
  }

  // Validate year part (first 2 digits) - should be reasonable
  const yearPart = parseInt(periodKeyString.slice(0, 2));
  const currentYear = new Date().getFullYear() % 100;
  if (yearPart < 10 || yearPart > currentYear + 5) {
    return { 
      isValid: false, 
      message: `Period year ${yearPart} seems invalid - should be between 10 and ${currentYear + 5}` 
    };
  }

  // Special handling for annual periods like "24AA"
  if (periodKeyString.length === 4 && periodKeyString.slice(2) === 'AA') {
    // Annual period is valid
    return { isValid: true, message: "Valid annual period key" };
  }

  // Validate period part for quarterly submissions
  if (periodKeyString.length === 4 && periodKeyString[2] === 'A') {
    const quarter = periodKeyString[3];
    if (!['1', '2', '3', '4'].includes(quarter)) {
      return { 
        isValid: false, 
        message: "Quarterly period must be A1, A2, A3, or A4" 
      };
    }
  }

  return { isValid: true, message: "Valid period key" };
}

/**
 * Validates VAT amount
 * @param {string|number} vatDue - The VAT amount to validate
 * @returns {object} - {isValid: boolean, message: string, parsedValue: number}
 */
export function validateVatAmount(vatDue) {
  if (vatDue === null || vatDue === undefined || vatDue === "") {
    return { isValid: false, message: "VAT amount is required" };
  }

  const vatDueString = String(vatDue).trim();
  
  // Check if it's a valid number
  const parsedValue = parseFloat(vatDueString);
  if (isNaN(parsedValue)) {
    return { 
      isValid: false, 
      message: "VAT amount must be a valid number (e.g., 1000.50)" 
    };
  }

  // Check for reasonable bounds
  if (parsedValue < 0) {
    return { 
      isValid: false, 
      message: "VAT amount cannot be negative" 
    };
  }

  // Check for excessive decimal places (HMRC typically accepts 2 decimal places)
  const decimalPart = vatDueString.split('.')[1];
  if (decimalPart && decimalPart.length > 2) {
    return { 
      isValid: false, 
      message: "VAT amount cannot have more than 2 decimal places" 
    };
  }

  // Check for reasonable upper bound (£10 million)
  if (parsedValue > 10000000) {
    return { 
      isValid: false, 
      message: "VAT amount exceeds reasonable limit (£10,000,000)" 
    };
  }

  return { 
    isValid: true, 
    message: "Valid VAT amount", 
    parsedValue: Math.round(parsedValue * 100) / 100 // Round to 2 decimal places
  };
}

/**
 * Validates all submission parameters at once
 * @param {object} params - {vatNumber, periodKey, vatDue}
 * @returns {object} - {isValid: boolean, errors: string[], validatedData: object}
 */
export function validateSubmissionParams({ vatNumber, periodKey, vatDue }) {
  const errors = [];
  const validatedData = {};

  // Validate VRN
  const vrnValidation = validateVrn(vatNumber);
  if (!vrnValidation.isValid) {
    errors.push(`VRN: ${vrnValidation.message}`);
  } else {
    validatedData.vatNumber = vatNumber;
  }

  // Validate period key
  const periodValidation = validatePeriodKey(periodKey);
  if (!periodValidation.isValid) {
    errors.push(`Period: ${periodValidation.message}`);
  } else {
    validatedData.periodKey = periodKey.trim().toUpperCase();
  }

  // Validate VAT amount
  const vatValidation = validateVatAmount(vatDue);
  if (!vatValidation.isValid) {
    errors.push(`VAT Amount: ${vatValidation.message}`);
  } else {
    validatedData.vatDue = vatValidation.parsedValue;
  }

  return {
    isValid: errors.length === 0,
    errors,
    validatedData
  };
}