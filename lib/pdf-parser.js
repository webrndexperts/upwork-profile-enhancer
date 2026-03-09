// lib/pdf-parser.js
// Client-side PDF text extraction using Mozilla pdf.js
// ─────────────────────────────────────────────────────

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_PAGES = 50;
const ALLOWED_TYPES = ['application/pdf'];

/**
 * Validates an uploaded file before processing.
 *
 * @param {File} file - The uploaded file object
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePDFFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'Only PDF files are accepted.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return { valid: false, error: `File too large (${sizeMB}MB). Maximum is 5MB.` };
  }

  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  return { valid: true };
}

/**
 * Extracts text content from a PDF file.
 *
 * @param {File} file - The PDF file to extract text from
 * @returns {Promise<string>} Extracted text content
 * @throws {Error} If extraction fails
 */
export async function extractTextFromPDF(file) {
  const validation = validatePDFFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Dynamically import pdf.js
  const pdfjsLib = await import(chrome.runtime.getURL('lib/vendor/pdf.min.mjs'));

  // Set worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.mjs');

  const arrayBuffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer,
      standardFontDataUrl: chrome.runtime.getURL('lib/vendor/standard_fonts/')
    }).promise;
  } catch (err) {
    if (err.message?.includes('password')) {
      throw new Error('This PDF is password-protected. Please upload an unprotected file.');
    }
    throw new Error('Could not read this PDF. The file may be corrupted.');
  }

  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  const textParts = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText) {
      textParts.push(pageText);
    }
  }

  const fullText = textParts.join('\n\n');

  if (!fullText.trim()) {
    throw new Error('No readable text found in this PDF. It may be a scanned image — please upload a text-based PDF.');
  }

  // Cap extracted text to prevent oversized prompts
  return fullText.substring(0, 15000);
}
